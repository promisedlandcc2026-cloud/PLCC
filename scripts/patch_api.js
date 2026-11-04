
import fs from 'fs';
import path from 'path';

const filePath = path.resolve('api/people/index.ts');
console.log(`Reading ${filePath}...`);
let content = fs.readFileSync(filePath, 'utf8');

// Define Start and End Anchors
const startMarker = "if (error && error.code === '23503') {";
const endMarker = "if (error) {"; // The block immediately following it

const startIndex = content.indexOf(startMarker);
const endIndex = content.lastIndexOf(endMarker); // careful, find the one AFTER start

if (startIndex === -1) {
    console.error("Could not find start marker!");
    process.exit(1);
}

// Find the end marker *after* the start marker
const contentAfterStart = content.substring(startIndex);
const nextBlockRelativeIndex = contentAfterStart.indexOf(endMarker);

if (nextBlockRelativeIndex === -1) {
    console.error("Could not find end marker after start marker!");
    process.exit(1);
}

const absoluteEndIndex = startIndex + nextBlockRelativeIndex;

// Original Block to verify (debugging)
// console.log("Replacing block:\n", content.substring(startIndex, absoluteEndIndex));

// New Logic
const newLogic = `if (error && error.code === '23503') {
                        console.warn(\`[API] Member \${memberId} missing from 'members' table. Checking for existing profile by email...\`);

                        // 1. Check if member exists by EMAIL
                        const { data: existingMember } = await supabaseAdmin!
                            .from('members')
                            .select('id')
                            .eq('email', user?.email)
                            .neq('email', '') 
                            .single();
                        
                        if (existingMember) {
                            console.log(\`[API] Found existing member \${existingMember.id} with email \${user?.email}. Attempting to claim profile...\`);
                            
                            // 2. Try to UPDATE the existing member's ID to be the Auth ID (Claiming)
                             const { error: updateError } = await supabaseAdmin!
                                .from('members')
                                .update({ 
                                    id: authUserId, 
                                    status: 'Active', 
                                    joined_date: new Date().toISOString()
                                })
                                .eq('id', existingMember.id);

                            if (!updateError) {
                                console.log(\`[API] Successfully claimed profile! Redirecting teams...\`);
                                // Retry join with new ID
                                const retry = await joinTeamOp();
                                if (retry.error) {
                                    console.error("[API] Failed to join team after profile claim:", retry.error);
                                    throw retry.error;
                                }
                                return res.status(200).json({ success: true, message: "Joined team (Claimed Profile)" });
                            } else {
                                console.warn(\`[API] Failed to claim profile (likely FK constraints):\`, updateError);
                            }
                        }

                        // 3. Fallback: Create NEW Member
                        console.log(\`[API] Creating new member profile for \${authUserId}...\`);
                        
                        let firstName = 'Member';
                        let lastName = '';
                        
                        if (user?.name) {
                            const parts = user.name.split(' ');
                            firstName = parts[0];
                            lastName = parts.slice(1).join(' ');
                        } else {
                            firstName = user?.metadata?.name?.split(' ')[0] || user?.metadata?.full_name?.split(' ')[0] || 'Member';
                            lastName = user?.metadata?.name?.split(' ').slice(1).join(' ') || user?.metadata?.full_name?.split(' ').slice(1).join(' ') || '';
                        }

                        const { error: createError } = await supabaseAdmin!
                            .from('members')
                            .insert({
                                id: memberId,
                                first_name: firstName,
                                last_name: lastName,
                                email: user?.email || '',
                                status: 'Active',
                                joined_date: new Date().toISOString()
                            });

                        if (createError) {
                            console.error("[API] Failed to auto-create member:", createError);
                            throw createError;
                        }

                        // Retry join
                        const retry = await joinTeamOp();
                        error = retry.error;
                    }

                    `;

// Construct new file content
// We replace everything from startIndex up to absoluteEndIndex
// But we need to make sure we keep the whitespace before `if (error) {` if it was captured.
// My logic: `absoluteEndIndex` points to the start of `if (error) {`.
// So replacing `startIndex` to `absoluteEndIndex` removes the whole block AND the whitespace between them?
// The `newLogic` ends with `}` and some newlines. I should verify alignment.

// I'll add the necessary indentation (20 spaces) to lines?
// The template usage above handles it roughly, but might be ugly. Lint will fix it or we don't care about formatting perfectly right now.

const finalContent = content.substring(0, startIndex) + "                    " + newLogic.trim() + "\n\n                    " + content.substring(absoluteEndIndex);

fs.writeFileSync(filePath, finalContent);
console.log("Successfully patched api/people/index.ts");
