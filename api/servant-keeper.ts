import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

interface FieldMapping {
    sk_field_name: string;
    awc_field_name: string;
    field_type: string;
    is_required: boolean;
    default_value?: string;
    transform_rule?: any;
}

interface SyncResult {
    total: number;
    created: number;
    updated: number;
    failed: number;
    errors: any[];
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const { resource, action } = req.query;

    try {
        // Get authenticated user
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
        
        if (authError || !user) {
            return res.status(401).json({ error: 'Invalid token' });
        }

        // Check user has admin/finance role
        const { data: userData } = await supabaseAdmin
            .from('users')
            .select('role')
            .eq('id', user.id)
            .single();

        if (!userData || !['ADMIN', 'SUPER_ADMIN', 'PASTOR', 'FINANCE', 'SECRETARY'].includes(userData.role)) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }

        // Configuration endpoints
        if (resource === 'config') {
            if (req.method === 'GET') {
                const { data, error } = await supabaseAdmin
                    .from('servant_keeper_config')
                    .select('*')
                    .single();

                if (error && error.code !== 'PGRST116') throw error;
                return res.status(200).json({ ok: true, config: data });
            }

            if (req.method === 'POST' || req.method === 'PUT') {
                const config = req.body;
                
                // Check if config exists
                const { data: existing } = await supabaseAdmin
                    .from('servant_keeper_config')
                    .select('id')
                    .single();

                if (existing) {
                    const { data, error } = await supabaseAdmin
                        .from('servant_keeper_config')
                        .update(config)
                        .eq('id', existing.id)
                        .select()
                        .single();

                    if (error) throw error;
                    return res.status(200).json({ ok: true, config: data });
                } else {
                    const { data, error } = await supabaseAdmin
                        .from('servant_keeper_config')
                        .insert(config)
                        .select()
                        .single();

                    if (error) throw error;
                    return res.status(200).json({ ok: true, config: data });
                }
            }
        }

        // Field mapping endpoints
        if (resource === 'mappings') {
            const { entity_type } = req.query;

            if (req.method === 'GET') {
                let query = supabaseAdmin
                    .from('servant_keeper_field_mapping')
                    .select('*');

                if (entity_type) {
                    query = query.eq('entity_type', entity_type);
                }

                const { data, error } = await query.order('sk_field_name');
                if (error) throw error;
                return res.status(200).json({ ok: true, mappings: data });
            }

            if (req.method === 'POST') {
                const mappings = req.body.mappings;
                const { data, error } = await supabaseAdmin
                    .from('servant_keeper_field_mapping')
                    .insert(mappings)
                    .select();

                if (error) throw error;
                return res.status(200).json({ ok: true, mappings: data });
            }

            if (req.method === 'PUT') {
                const id = req.body?.id;
                const updates: Record<string, unknown> = {};
                for (const key of ['sk_field_name', 'awc_field_name', 'field_type', 'is_required', 'default_value', 'transform_rule']) {
                    if (req.body && Object.prototype.hasOwnProperty.call(req.body, key)) updates[key] = req.body[key];
                }
                const { data, error } = await supabaseAdmin
                    .from('servant_keeper_field_mapping')
                    .update(updates)
                    .eq('id', id)
                    .select()
                    .single();

                if (error) throw error;
                return res.status(200).json({ ok: true, mapping: data });
            }

            if (req.method === 'DELETE') {
                const { id } = req.query;
                const { error } = await supabaseAdmin
                    .from('servant_keeper_field_mapping')
                    .delete()
                    .eq('id', id);

                if (error) throw error;
                return res.status(200).json({ ok: true });
            }
        }

        // Import endpoint
        if (action === 'import') {
            const { entity_type, csv_data } = req.body;

            if (!entity_type || !csv_data) {
                return res.status(400).json({ error: 'Missing entity_type or csv_data' });
            }

            // Create sync history record
            const { data: syncHistory, error: historyError } = await supabaseAdmin
                .from('servant_keeper_sync_history')
                .insert({
                    sync_type: 'import',
                    entity_type,
                    status: 'processing',
                    created_by: user.id
                })
                .select()
                .single();

            if (historyError) throw historyError;

            try {
                // Parse CSV
                const records = parse(csv_data, {
                    columns: true,
                    skip_empty_lines: true,
                    trim: true
                });

                // Get field mappings
                const { data: mappings } = await supabaseAdmin
                    .from('servant_keeper_field_mapping')
                    .select('*')
                    .eq('entity_type', entity_type);

                if (!mappings || mappings.length === 0) {
                    throw new Error('No field mappings configured for ' + entity_type);
                }

                const result = await importRecords(entity_type, records, mappings, syncHistory.id, user.id);

                // Update sync history
                await supabaseAdmin
                    .from('servant_keeper_sync_history')
                    .update({
                        status: 'completed',
                        records_total: result.total,
                        records_processed: result.created + result.updated,
                        records_created: result.created,
                        records_updated: result.updated,
                        records_failed: result.failed,
                        error_log: result.errors,
                        completed_at: new Date().toISOString()
                    })
                    .eq('id', syncHistory.id);

                return res.status(200).json({ ok: true, result, sync_id: syncHistory.id });

            } catch (error: any) {
                // Update sync history with error
                await supabaseAdmin
                    .from('servant_keeper_sync_history')
                    .update({
                        status: 'failed',
                        error_log: [{ message: error.message, stack: error.stack }],
                        completed_at: new Date().toISOString()
                    })
                    .eq('id', syncHistory.id);

                throw error;
            }
        }

        // Export endpoint
        if (action === 'export') {
            const { entity_type, filters } = req.body;

            if (!entity_type) {
                return res.status(400).json({ error: 'Missing entity_type' });
            }

            // Create sync history record
            const { data: syncHistory, error: historyError } = await supabaseAdmin
                .from('servant_keeper_sync_history')
                .insert({
                    sync_type: 'export',
                    entity_type,
                    status: 'processing',
                    created_by: user.id
                })
                .select()
                .single();

            if (historyError) throw historyError;

            try {
                // Get field mappings
                const { data: mappings } = await supabaseAdmin
                    .from('servant_keeper_field_mapping')
                    .select('*')
                    .eq('entity_type', entity_type);

                if (!mappings || mappings.length === 0) {
                    throw new Error('No field mappings configured for ' + entity_type);
                }

                const csvData = await exportRecords(entity_type, mappings, filters);

                // Update sync history
                await supabaseAdmin
                    .from('servant_keeper_sync_history')
                    .update({
                        status: 'completed',
                        records_total: csvData.recordCount,
                        records_processed: csvData.recordCount,
                        completed_at: new Date().toISOString()
                    })
                    .eq('id', syncHistory.id);

                return res.status(200).json({ 
                    ok: true, 
                    csv: csvData.csv, 
                    record_count: csvData.recordCount,
                    sync_id: syncHistory.id 
                });

            } catch (error: any) {
                // Update sync history with error
                await supabaseAdmin
                    .from('servant_keeper_sync_history')
                    .update({
                        status: 'failed',
                        error_log: [{ message: error.message, stack: error.stack }],
                        completed_at: new Date().toISOString()
                    })
                    .eq('id', syncHistory.id);

                throw error;
            }
        }

        // Sync history endpoints
        if (resource === 'history') {
            if (req.method === 'GET') {
                const { limit = 50, offset = 0 } = req.query;
                
                const { data, error, count } = await supabaseAdmin
                    .from('servant_keeper_sync_history')
                    .select('*, created_by:users!servant_keeper_sync_history_created_by_fkey(first_name, last_name)', { count: 'exact' })
                    .order('created_at', { ascending: false })
                    .range(Number(offset), Number(offset) + Number(limit) - 1);

                if (error) throw error;
                return res.status(200).json({ ok: true, history: data, total: count });
            }
        }

        // Conflicts endpoints
        if (resource === 'conflicts') {
            if (req.method === 'GET') {
                const { status = 'pending' } = req.query;
                
                const { data, error } = await supabaseAdmin
                    .from('servant_keeper_conflicts')
                    .select('*')
                    .eq('resolution_status', status)
                    .order('created_at', { ascending: false });

                if (error) throw error;
                return res.status(200).json({ ok: true, conflicts: data });
            }

            if (req.method === 'POST') {
                const { conflict_id, resolution_action } = req.body;
                
                const { data: conflict } = await supabaseAdmin
                    .from('servant_keeper_conflicts')
                    .select('*')
                    .eq('id', conflict_id)
                    .single();

                if (!conflict) {
                    return res.status(404).json({ error: 'Conflict not found' });
                }

                // Apply resolution
                await resolveConflict(conflict, resolution_action, user.id);

                // Update conflict status
                const { data, error } = await supabaseAdmin
                    .from('servant_keeper_conflicts')
                    .update({
                        resolution_status: 'resolved',
                        resolution_action,
                        resolved_by: user.id,
                        resolved_at: new Date().toISOString()
                    })
                    .eq('id', conflict_id)
                    .select()
                    .single();

                if (error) throw error;
                return res.status(200).json({ ok: true, conflict: data });
            }
        }

        return res.status(404).json({ error: 'Endpoint not found' });

    } catch (error: any) {
        console.error('Servant Keeper API Error:', error);
        return res.status(500).json({ error: error.message || 'Internal server error' });
    }
}

// Helper function to import records
async function importRecords(
    entityType: string, 
    records: any[], 
    mappings: FieldMapping[],
    syncHistoryId: string,
    userId: string
): Promise<SyncResult> {
    const result: SyncResult = {
        total: records.length,
        created: 0,
        updated: 0,
        failed: 0,
        errors: []
    };

    for (const skRecord of records) {
        try {
            // Transform SK record to PLCC format
            const awcRecord: any = {};
            const skId = skRecord.IndividualID || skRecord.ContributionID || skRecord.AttendanceID || skRecord.FamilyID;

            for (const mapping of mappings) {
                const skValue = skRecord[mapping.sk_field_name];
                
                if (mapping.is_required && !skValue && !mapping.default_value) {
                    throw new Error(`Required field ${mapping.sk_field_name} is missing`);
                }

                awcRecord[mapping.awc_field_name] = transformValue(
                    skValue || mapping.default_value,
                    mapping.field_type,
                    mapping.transform_rule
                );
            }

            // Check if record already exists
            const { data: existingMapping } = await supabaseAdmin
                .from('servant_keeper_sync_mapping')
                .select('awc_record_id')
                .eq('entity_type', entityType)
                .eq('sk_record_id', skId)
                .single();

            const tableName = getTableName(entityType);
            
            if (existingMapping) {
                // Update existing record
                const { error } = await supabaseAdmin
                    .from(tableName)
                    .update(awcRecord)
                    .eq('id', existingMapping.awc_record_id);

                if (error) throw error;

                // Update sync mapping
                await supabaseAdmin
                    .from('servant_keeper_sync_mapping')
                    .update({
                        last_synced_at: new Date().toISOString(),
                        awc_data: awcRecord,
                        sk_data: skRecord
                    })
                    .eq('entity_type', entityType)
                    .eq('sk_record_id', skId);

                result.updated++;
            } else {
                // Create new record
                const { data: newRecord, error } = await supabaseAdmin
                    .from(tableName)
                    .insert(awcRecord)
                    .select()
                    .single();

                if (error) throw error;

                // Create sync mapping
                await supabaseAdmin
                    .from('servant_keeper_sync_mapping')
                    .insert({
                        entity_type: entityType,
                        awc_record_id: newRecord.id,
                        sk_record_id: skId,
                        sync_direction: 'import',
                        awc_data: awcRecord,
                        sk_data: skRecord
                    });

                result.created++;
            }

        } catch (error: any) {
            result.failed++;
            result.errors.push({
                record: skRecord,
                error: error.message
            });

            // Log conflict if it's a validation or duplicate error
            if (error.message.includes('duplicate') || error.message.includes('required')) {
                await supabaseAdmin
                    .from('servant_keeper_conflicts')
                    .insert({
                        sync_history_id: syncHistoryId,
                        entity_type: entityType,
                        sk_record_id: skRecord.IndividualID || skRecord.ContributionID || skRecord.AttendanceID,
                        conflict_type: error.message.includes('duplicate') ? 'duplicate' : 'validation_error',
                        conflict_details: { error: error.message },
                        sk_data: skRecord
                    });
            }
        }
    }

    return result;
}

// Helper function to export records
async function exportRecords(
    entityType: string,
    mappings: FieldMapping[],
    filters?: any
): Promise<{ csv: string; recordCount: number }> {
    const tableName = getTableName(entityType);
    
    let query = supabaseAdmin.from(tableName).select('*');
    
    // Apply filters if provided
    if (filters) {
        Object.keys(filters).forEach(key => {
            query = query.eq(key, filters[key]);
        });
    }

    const { data: records, error } = await query;
    if (error) throw error;

    if (!records || records.length === 0) {
        return { csv: '', recordCount: 0 };
    }

    // Transform PLCC records to SK format
    const skRecords = records.map(awcRecord => {
        const skRecord: any = {};
        
        for (const mapping of mappings) {
            const awcValue = awcRecord[mapping.awc_field_name];
            skRecord[mapping.sk_field_name] = formatValue(awcValue, mapping.field_type);
        }
        
        return skRecord;
    });

    // Convert to CSV
    const csv = stringify(skRecords, {
        header: true,
        columns: mappings.map(m => m.sk_field_name)
    });

    return { csv, recordCount: records.length };
}

// Helper function to resolve conflicts
async function resolveConflict(conflict: any, action: string, userId: string) {
    const tableName = getTableName(conflict.entity_type);

    switch (action) {
        case 'use_awc':
            // Keep PLCC data, update SK mapping
            await supabaseAdmin
                .from('servant_keeper_sync_mapping')
                .update({
                    sk_data: conflict.awc_data,
                    last_synced_at: new Date().toISOString()
                })
                .eq('entity_type', conflict.entity_type)
                .eq('sk_record_id', conflict.sk_record_id);
            break;

        case 'use_sk':
            // Use SK data, update PLCC record
            await supabaseAdmin
                .from(tableName)
                .update(conflict.sk_data)
                .eq('id', conflict.awc_record_id);

            await supabaseAdmin
                .from('servant_keeper_sync_mapping')
                .update({
                    awc_data: conflict.sk_data,
                    last_synced_at: new Date().toISOString()
                })
                .eq('entity_type', conflict.entity_type)
                .eq('awc_record_id', conflict.awc_record_id);
            break;

        case 'merge':
            // Merge both datasets (prefer PLCC for conflicts)
            const merged = { ...conflict.sk_data, ...conflict.awc_data };
            await supabaseAdmin
                .from(tableName)
                .update(merged)
                .eq('id', conflict.awc_record_id);
            break;

        case 'skip':
            // Do nothing, just mark as resolved
            break;
    }
}

// Helper functions
function getTableName(entityType: string): string {
    const tableMap: Record<string, string> = {
        'member': 'members',
        'household': 'households',
        'contribution': 'giving_transactions',
        'attendance': 'attendance'
    };
    return tableMap[entityType] || entityType;
}

function transformValue(value: any, fieldType: string, transformRule?: any): any {
    if (!value) return null;

    switch (fieldType) {
        case 'number':
            return parseFloat(value);
        case 'date':
            return new Date(value).toISOString();
        case 'boolean':
            return value === 'true' || value === '1' || value === 'Yes';
        case 'email':
            return value.toLowerCase().trim();
        case 'phone':
            return value.replace(/\D/g, '');
        default:
            return value;
    }
}

function formatValue(value: any, fieldType: string): string {
    if (!value) return '';

    switch (fieldType) {
        case 'date':
            return new Date(value).toLocaleDateString('en-US');
        case 'boolean':
            return value ? 'Yes' : 'No';
        default:
            return String(value);
    }
}
