SELECT 
    tc.constraint_name, 
    rc.update_rule, 
    rc.delete_rule,
    kcu.table_name,
    kcu.column_name
FROM 
    information_schema.table_constraints AS tc 
    JOIN information_schema.referential_constraints AS rc 
    ON tc.constraint_name = rc.constraint_name 
    JOIN information_schema.key_column_usage AS kcu 
    ON tc.constraint_name = kcu.constraint_name
WHERE 
    tc.constraint_type = 'FOREIGN KEY' AND 
    kcu.referenced_table_name = 'members';
