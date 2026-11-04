import React, { useState, useEffect } from 'react';
import {
    Database,
    Upload,
    Download,
    RefreshCw,
    Settings,
    CheckCircle2,
    XCircle,
    AlertTriangle,
    Clock,
    FileText,
    ArrowRight,
    ArrowLeft,
    GitMerge,
    History,
    Play,
    Pause
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface Config {
    id: string;
    sync_enabled: boolean;
    sync_direction: 'import' | 'export' | 'both';
    auto_sync_enabled: boolean;
    sync_frequency: string;
    last_import_at?: string;
    last_export_at?: string;
}

interface SyncHistory {
    id: string;
    sync_type: string;
    entity_type: string;
    status: string;
    records_total: number;
    records_created: number;
    records_updated: number;
    records_failed: number;
    created_at: string;
    completed_at?: string;
}

const ServantKeeperIntegration: React.FC = () => {
    const [config, setConfig] = useState<Config | null>(null);
    const [history, setHistory] = useState<SyncHistory[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'overview' | 'import' | 'export' | 'mappings' | 'history'>('overview');
    const [csvFile, setCsvFile] = useState<File | null>(null);
    const [entityType, setEntityType] = useState<'member' | 'contribution' | 'attendance'>('member');
    const [isSyncing, setIsSyncing] = useState(false);

    useEffect(() => {
        loadConfig();
        loadHistory();
    }, []);

    const loadConfig = async () => {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const response = await fetch('/api/servant-keeper?resource=config', {
                headers: {
                    'Authorization': `Bearer ${session?.access_token}`
                }
            });
            const result = await response.json();
            if (result.ok) {
                setConfig(result.config);
            }
        } catch (error) {
            console.error('Error loading config:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const loadHistory = async () => {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const response = await fetch('/api/servant-keeper?resource=history&limit=20', {
                headers: {
                    'Authorization': `Bearer ${session?.access_token}`
                }
            });
            const result = await response.json();
            if (result.ok) {
                setHistory(result.history);
            }
        } catch (error) {
            console.error('Error loading history:', error);
        }
    };

    const handleImport = async () => {
        if (!csvFile) {
            alert('Please select a CSV file');
            return;
        }

        setIsSyncing(true);
        try {
            const csvText = await csvFile.text();
            const { data: { session } } = await supabase.auth.getSession();
            
            const response = await fetch('/api/servant-keeper?action=import', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session?.access_token}`
                },
                body: JSON.stringify({
                    entity_type: entityType,
                    csv_data: csvText
                })
            });

            const result = await response.json();
            if (result.ok) {
                alert(`Import completed!\nCreated: ${result.result.created}\nUpdated: ${result.result.updated}\nFailed: ${result.result.failed}`);
                loadHistory();
                loadConfig();
            } else {
                alert('Import failed: ' + result.error);
            }
        } catch (error: any) {
            console.error('Import error:', error);
            alert('Import failed: ' + error.message);
        } finally {
            setIsSyncing(false);
            setCsvFile(null);
        }
    };

    const handleExport = async () => {
        setIsSyncing(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            
            const response = await fetch('/api/servant-keeper?action=export', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session?.access_token}`
                },
                body: JSON.stringify({
                    entity_type: entityType
                })
            });

            const result = await response.json();
            if (result.ok) {
                // Download CSV file
                const blob = new Blob([result.csv], { type: 'text/csv' });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `servant_keeper_${entityType}_export_${new Date().toISOString().split('T')[0]}.csv`;
                a.click();
                window.URL.revokeObjectURL(url);

                alert(`Export completed! ${result.record_count} records exported.`);
                loadHistory();
                loadConfig();
            } else {
                alert('Export failed: ' + result.error);
            }
        } catch (error: any) {
            console.error('Export error:', error);
            alert('Export failed: ' + error.message);
        } finally {
            setIsSyncing(false);
        }
    };

    const toggleSync = async () => {
        if (!config) return;

        try {
            const { data: { session } } = await supabase.auth.getSession();
            
            const response = await fetch('/api/servant-keeper?resource=config', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session?.access_token}`
                },
                body: JSON.stringify({
                    sync_enabled: !config.sync_enabled
                })
            });

            const result = await response.json();
            if (result.ok) {
                setConfig(result.config);
            }
        } catch (error) {
            console.error('Error toggling sync:', error);
        }
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-[#FDFDFB] flex items-center justify-center">
                <RefreshCw className="animate-spin text-burgundy" size={48} />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#FDFDFB] pb-32">
            {/* Header */}
            <div className="bg-white border-b border-gray-100 px-6 py-8">
                <div className="max-w-7xl mx-auto">
                    <div className="flex items-center gap-3 mb-2">
                        <Database className="text-burgundy" size={32} />
                        <div className="h-1 w-8 bg-gold rounded-full" />
                        <h2 className="text-[10px] font-black text-gold uppercase tracking-[0.4em]">Integration</h2>
                    </div>
                    <h1 className="text-4xl font-black text-[#0d1a14] tracking-tighter leading-none mb-1">
                        Servant Keeper 8<span className="text-gold">.</span>
                    </h1>
                    <p className="text-gray-400 font-medium text-sm">Bidirectional sync with your church management system</p>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-6 mt-10">
                {/* Status Card */}
                <div className="bg-white rounded-[2.5rem] border border-gray-100 p-8 mb-8 shadow-sm">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-6">
                            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${config?.sync_enabled ? 'bg-green-50' : 'bg-gray-50'}`}>
                                {config?.sync_enabled ? (
                                    <CheckCircle2 className="text-green-600" size={32} />
                                ) : (
                                    <Pause className="text-gray-400" size={32} />
                                )}
                            </div>
                            <div>
                                <h3 className="text-2xl font-black text-[#0d1a14] mb-1">
                                    {config?.sync_enabled ? 'Sync Active' : 'Sync Paused'}
                                </h3>
                                <p className="text-sm text-gray-500">
                                    Direction: <span className="font-bold text-burgundy uppercase">{config?.sync_direction}</span>
                                </p>
                                {config?.last_import_at && (
                                    <p className="text-xs text-gray-400 mt-1">
                                        Last import: {new Date(config.last_import_at).toLocaleString()}
                                    </p>
                                )}
                            </div>
                        </div>
                        <button
                            onClick={toggleSync}
                            className={`px-8 py-4 rounded-xl font-black text-sm uppercase tracking-widest transition-all ${
                                config?.sync_enabled
                                    ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                    : 'bg-burgundy text-gold hover:scale-105'
                            }`}
                        >
                            {config?.sync_enabled ? 'Pause Sync' : 'Enable Sync'}
                        </button>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-2 mb-8 overflow-x-auto">
                    {[
                        { id: 'overview', label: 'Overview', icon: Database },
                        { id: 'import', label: 'Import', icon: Upload },
                        { id: 'export', label: 'Export', icon: Download },
                        { id: 'history', label: 'History', icon: History }
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${
                                activeTab === tab.id
                                    ? 'bg-burgundy text-gold'
                                    : 'bg-white text-gray-400 hover:bg-gray-50'
                            }`}
                        >
                            <tab.icon size={16} />
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Overview Tab */}
                {activeTab === 'overview' && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="bg-white rounded-[2rem] border border-gray-100 p-6">
                            <div className="flex items-center gap-3 mb-4">
                                <ArrowRight className="text-blue-500" size={24} />
                                <h3 className="font-black text-burgundy uppercase text-sm">Import</h3>
                            </div>
                            <p className="text-3xl font-black text-[#0d1a14] mb-2">
                                {history.filter(h => h.sync_type === 'import').length}
                            </p>
                            <p className="text-xs text-gray-400 uppercase tracking-widest">Total Imports</p>
                        </div>

                        <div className="bg-white rounded-[2rem] border border-gray-100 p-6">
                            <div className="flex items-center gap-3 mb-4">
                                <ArrowLeft className="text-green-500" size={24} />
                                <h3 className="font-black text-burgundy uppercase text-sm">Export</h3>
                            </div>
                            <p className="text-3xl font-black text-[#0d1a14] mb-2">
                                {history.filter(h => h.sync_type === 'export').length}
                            </p>
                            <p className="text-xs text-gray-400 uppercase tracking-widest">Total Exports</p>
                        </div>

                        <div className="bg-white rounded-[2rem] border border-gray-100 p-6">
                            <div className="flex items-center gap-3 mb-4">
                                <GitMerge className="text-purple-500" size={24} />
                                <h3 className="font-black text-burgundy uppercase text-sm">Synced</h3>
                            </div>
                            <p className="text-3xl font-black text-[#0d1a14] mb-2">
                                {history.reduce((sum, h) => sum + (h.records_created + h.records_updated), 0)}
                            </p>
                            <p className="text-xs text-gray-400 uppercase tracking-widest">Total Records</p>
                        </div>
                    </div>
                )}

                {/* Import Tab */}
                {activeTab === 'import' && (
                    <div className="bg-white rounded-[2.5rem] border border-gray-100 p-8">
                        <h3 className="text-2xl font-black text-[#0d1a14] mb-6">Import from Servant Keeper</h3>
                        
                        <div className="space-y-6">
                            <div>
                                <label className="block text-sm font-black text-burgundy uppercase tracking-widest mb-2">
                                    Entity Type
                                </label>
                                <select
                                    value={entityType}
                                    onChange={(e) => setEntityType(e.target.value as any)}
                                    className="w-full px-4 py-3 rounded-xl border border-gray-200 font-medium"
                                >
                                    <option value="member">Members</option>
                                    <option value="contribution">Contributions</option>
                                    <option value="attendance">Attendance</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-black text-burgundy uppercase tracking-widest mb-2">
                                    CSV File
                                </label>
                                <input
                                    type="file"
                                    accept=".csv"
                                    onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
                                    className="w-full px-4 py-3 rounded-xl border border-gray-200"
                                />
                                {csvFile && (
                                    <p className="text-xs text-gray-500 mt-2">
                                        Selected: {csvFile.name} ({(csvFile.size / 1024).toFixed(2)} KB)
                                    </p>
                                )}
                            </div>

                            <button
                                onClick={handleImport}
                                disabled={!csvFile || isSyncing}
                                className="w-full bg-burgundy text-gold px-8 py-4 rounded-xl font-black text-sm uppercase tracking-widest hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {isSyncing ? (
                                    <>
                                        <RefreshCw className="animate-spin" size={20} />
                                        Importing...
                                    </>
                                ) : (
                                    <>
                                        <Upload size={20} />
                                        Import Data
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                )}

                {/* Export Tab */}
                {activeTab === 'export' && (
                    <div className="bg-white rounded-[2.5rem] border border-gray-100 p-8">
                        <h3 className="text-2xl font-black text-[#0d1a14] mb-6">Export to Servant Keeper</h3>
                        
                        <div className="space-y-6">
                            <div>
                                <label className="block text-sm font-black text-burgundy uppercase tracking-widest mb-2">
                                    Entity Type
                                </label>
                                <select
                                    value={entityType}
                                    onChange={(e) => setEntityType(e.target.value as any)}
                                    className="w-full px-4 py-3 rounded-xl border border-gray-200 font-medium"
                                >
                                    <option value="member">Members</option>
                                    <option value="contribution">Contributions</option>
                                    <option value="attendance">Attendance</option>
                                </select>
                            </div>

                            <button
                                onClick={handleExport}
                                disabled={isSyncing}
                                className="w-full bg-green-600 text-white px-8 py-4 rounded-xl font-black text-sm uppercase tracking-widest hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {isSyncing ? (
                                    <>
                                        <RefreshCw className="animate-spin" size={20} />
                                        Exporting...
                                    </>
                                ) : (
                                    <>
                                        <Download size={20} />
                                        Export Data
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                )}

                {/* History Tab */}
                {activeTab === 'history' && (
                    <div className="bg-white rounded-[2.5rem] border border-gray-100 p-8">
                        <h3 className="text-2xl font-black text-[#0d1a14] mb-6">Sync History</h3>
                        
                        <div className="space-y-4">
                            {history.map(item => (
                                <div key={item.id} className="border border-gray-100 rounded-xl p-4 flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                                            item.status === 'completed' ? 'bg-green-50' :
                                            item.status === 'failed' ? 'bg-red-50' :
                                            'bg-yellow-50'
                                        }`}>
                                            {item.status === 'completed' ? (
                                                <CheckCircle2 className="text-green-600" size={20} />
                                            ) : item.status === 'failed' ? (
                                                <XCircle className="text-red-600" size={20} />
                                            ) : (
                                                <Clock className="text-yellow-600" size={20} />
                                            )}
                                        </div>
                                        <div>
                                            <p className="font-black text-sm text-[#0d1a14]">
                                                {item.sync_type.toUpperCase()} - {item.entity_type}
                                            </p>
                                            <p className="text-xs text-gray-500">
                                                {new Date(item.created_at).toLocaleString()}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-sm font-bold text-burgundy">
                                            {item.records_created + item.records_updated} / {item.records_total}
                                        </p>
                                        <p className="text-xs text-gray-400">
                                            Created: {item.records_created} | Updated: {item.records_updated}
                                        </p>
                                        {item.records_failed > 0 && (
                                            <p className="text-xs text-red-500">Failed: {item.records_failed}</p>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ServantKeeperIntegration;
