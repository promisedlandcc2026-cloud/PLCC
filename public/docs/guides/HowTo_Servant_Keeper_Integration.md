# How-To Guide: Servant Keeper 8 Integration
**Promised Land Christian Center (PLCC)**  
**For:** Admin Staff, Finance Team  
**Last Updated:** April 26, 2026

---

## What You'll Learn
This guide shows you how to sync data between Servant Keeper 8 and PLCC Connect using bidirectional CSV import/export.

---

## Overview

The Servant Keeper integration allows you to:
- **Import** member, contribution, and attendance data from Servant Keeper into PLCC Connect
- **Export** PLCC Connect data back to Servant Keeper format
- **Track** all sync operations with detailed history
- **Resolve** conflicts when data doesn't match between systems

---

## Quick Start

1. Export CSV from Servant Keeper 8
2. Import CSV into PLCC Connect
3. Review sync results
4. Export PLCC data back to Servant Keeper (optional)

---

## Part 1: Exporting from Servant Keeper 8

### Exporting Members

**Step 1:** Open Servant Keeper 8
- Launch the Servant Keeper application
- Log in with your credentials

**Step 2:** Navigate to Groups Keeper
- Click **Membership Manager**
- Select **Groups Keeper**

**Step 3:** Create Export Group
- Click **Add Group**
- Name it "AWC_Export_Members"
- Set to list **Individuals** (not families)
- Click **Save**

**Step 4:** Select All Members
- In the group, click **Select All**
- Or use filters to select specific members

**Step 5:** Export to CSV
- Click **Save As** dropdown
- Select **CSV File**
- Choose location and filename
- Click **Save**

**Required Fields in Export:**
- IndividualID
- FirstName
- LastName
- Email
- Phone
- Address
- City
- State
- Zip
- DateOfBirth
- Gender
- MemberStatus
- FamilyID
- JoinDate

---

### Exporting Contributions

**Step 1:** Open Contribution Manager
- Click **Contribution Manager**
- Select **Listings**

**Step 2:** Choose Date Range
- Select **Date Range** filter
- Enter start and end dates
- Click **Find**

**Step 3:** Export to CSV
- Click **Save As** dropdown
- Select **CSV File**
- Choose location and filename
- Click **Save**

**Required Fields in Export:**
- ContributionID
- IndividualID
- Date
- Amount
- Fund
- Method
- CheckNumber
- Notes

---

### Exporting Attendance

**Step 1:** Open Attendance Manager
- Click **Attendance Manager**
- Select **Listings**

**Step 2:** Choose Date Range
- Select **Date Range** filter
- Enter start and end dates
- Click **Find**

**Step 3:** Export to CSV
- Click **Save As** dropdown
- Select **CSV File**
- Choose location and filename
- Click **Save**

**Required Fields in Export:**
- AttendanceID
- IndividualID
- Date
- ServiceType
- CheckInMethod

---

## Part 2: Importing into PLCC Connect

### Accessing the Integration

**Step 1:** Log in to PLCC Connect
- Go to https://plcc-vault.vercel.app
- Enter your credentials
- Click **Sign In**

**Step 2:** Navigate to Integration
- Click **More** in the navigation
- Select **Servant Keeper Integration**
- Or go directly to `/admin/servant-keeper`

---

### Importing Data

**Step 1:** Select Import Tab
- Click the **Import** tab
- You'll see the import interface

**Step 2:** Choose Entity Type
- Select what you're importing:
  - **Members**: People and households
  - **Contributions**: Giving transactions
  - **Attendance**: Check-in records

**Step 3:** Upload CSV File
- Click **Choose File**
- Navigate to your exported CSV
- Select the file
- File name and size will appear

**Step 4:** Start Import
- Click **Import Data** button
- System will process the file
- Progress indicator will show

**Step 5:** Review Results
- Import summary will display:
  - **Total Records**: How many in CSV
  - **Created**: New records added
  - **Updated**: Existing records updated
  - **Failed**: Records with errors
- Click **OK** to close

---

### Understanding Import Results

**Successful Import:**
```
Import completed!
Created: 45
Updated: 12
Failed: 0
```
All records processed successfully.

**Partial Import:**
```
Import completed!
Created: 40
Updated: 10
Failed: 5
```
Some records had errors. Check History tab for details.

**Failed Import:**
```
Import failed: No field mappings configured for member
```
System configuration issue. Contact admin.

---

## Part 3: Exporting from PLCC Connect

### Exporting Data

**Step 1:** Select Export Tab
- Click the **Export** tab
- You'll see the export interface

**Step 2:** Choose Entity Type
- Select what you're exporting:
  - **Members**: All member data
  - **Contributions**: All giving records
  - **Attendance**: All check-in records

**Step 3:** Start Export
- Click **Export Data** button
- System will generate CSV file
- File will download automatically

**Step 4:** Save File
- Choose location on your computer
- File name format: `servant_keeper_[type]_export_[date].csv`
- Click **Save**

---

### Importing into Servant Keeper 8

**Step 1:** Open Servant Keeper 8
- Launch the application
- Log in with credentials

**Step 2:** Navigate to Import Tool
- Click **Administration Manager**
- Select **Tools**
- Click **Import Data**

**Step 3:** Select Import File
- Click **Select Import File**
- Navigate to downloaded CSV
- Select the file
- Click **Open**

**Step 4:** Map Fields
- Servant Keeper will show field mapping
- Verify fields match correctly
- Adjust if needed

**Step 5:** Import Data
- Click **Import** button
- Review import summary
- Click **Finish**

---

## Part 4: Monitoring and History

### Viewing Sync History

**Step 1:** Click History Tab
- See all past sync operations
- Sorted by most recent first

**Step 2:** Review Sync Details
Each entry shows:
- **Type**: Import or Export
- **Entity**: Members, Contributions, or Attendance
- **Status**: Completed, Failed, or Processing
- **Date/Time**: When sync occurred
- **Records**: Total, Created, Updated, Failed

**Step 3:** Identify Issues
- Green checkmark = Success
- Red X = Failed
- Yellow clock = In progress
- Click on entry for more details

---

### Understanding Sync Status

**Status Icons:**
- ✅ **Completed**: Sync finished successfully
- ❌ **Failed**: Sync encountered errors
- ⏱️ **Processing**: Sync is currently running
- ⏸️ **Pending**: Sync is queued

**Record Counts:**
- **Total**: Number of records in file
- **Created**: New records added to database
- **Updated**: Existing records modified
- **Failed**: Records that couldn't be processed

---

## Part 5: Troubleshooting

### Common Import Errors

**Error: "Required field FirstName is missing"**
**Solution:**
- Check CSV has FirstName column
- Verify column header spelling
- Ensure no empty required fields
- Re-export from Servant Keeper with all fields

**Error: "Duplicate record found"**
**Solution:**
- Record already exists in PLCC Connect
- System will update existing record
- Check if IndividualID matches
- Review sync mapping

**Error: "Invalid email format"**
**Solution:**
- Check email addresses in CSV
- Remove invalid emails
- Fix format (must have @)
- Re-import file

**Error: "No field mappings configured"**
**Solution:**
- Contact system administrator
- Field mappings need to be set up
- This is a one-time configuration
- Admin will configure in database

---

### Common Export Errors

**Error: "No records found to export"**
**Solution:**
- Check that data exists in PLCC Connect
- Verify entity type is correct
- Check date range filters
- Ensure you have permission to view data

**Error: "Export failed: Database connection error"**
**Solution:**
- Check internet connection
- Refresh the page
- Try again in a few minutes
- Contact IT if problem persists

---

### File Format Issues

**CSV File Won't Upload**
**Check:**
- File extension is .csv (not .xlsx or .xls)
- File size is under 10MB
- File is not corrupted
- File is not open in another program

**CSV Has Wrong Format**
**Check:**
- Exported from correct Servant Keeper module
- All required columns are present
- Column headers match expected names
- No extra rows at top of file

---

## Best Practices

### Before Importing
- [ ] Backup your PLCC Connect database
- [ ] Review CSV file for accuracy
- [ ] Check for duplicate records
- [ ] Verify required fields are present
- [ ] Test with small sample first

### During Import
- [ ] Don't close browser window
- [ ] Don't navigate away from page
- [ ] Wait for completion message
- [ ] Review results carefully
- [ ] Check for failed records

### After Import
- [ ] Verify data in PLCC Connect
- [ ] Check member profiles
- [ ] Review contribution totals
- [ ] Test attendance records
- [ ] Document any issues

### Regular Sync Schedule
- **Weekly**: Import new members and contributions
- **Monthly**: Full sync of all data
- **Quarterly**: Export PLCC data back to Servant Keeper
- **Annually**: Complete data audit and reconciliation

---

## Data Mapping Reference

### Member Fields

| Servant Keeper | PLCC Connect | Type | Required |
|:---|:---|:---|:---|
| IndividualID | id | Text | No |
| FirstName | first_name | Text | Yes |
| LastName | last_name | Text | Yes |
| Email | email | Email | No |
| Phone | phone | Phone | No |
| Address | address | Text | No |
| City | city | Text | No |
| State | state | Text | No |
| Zip | zip | Text | No |
| DateOfBirth | date_of_birth | Date | No |
| Gender | gender | Text | No |
| MemberStatus | status | Text | No |
| FamilyID | household_name | Text | No |
| JoinDate | join_date | Date | No |

---

### Contribution Fields

| Servant Keeper | PLCC Connect | Type | Required |
|:---|:---|:---|:---|
| ContributionID | id | Text | No |
| IndividualID | member_id | Text | Yes |
| Date | transaction_date | Date | Yes |
| Amount | amount | Number | Yes |
| Fund | fund_name | Text | No |
| Method | payment_method | Text | No |
| CheckNumber | check_number | Text | No |
| Notes | notes | Text | No |

---

### Attendance Fields

| Servant Keeper | PLCC Connect | Type | Required |
|:---|:---|:---|:---|
| AttendanceID | id | Text | No |
| IndividualID | member_id | Text | Yes |
| Date | check_in_time | Date | Yes |
| ServiceType | service_type | Text | No |
| CheckInMethod | check_in_method | Text | No |

---

## Security & Privacy

### Data Protection
- All imports are encrypted in transit
- Only authorized users can access integration
- Sync history is logged for audit
- Failed records are stored securely

### Access Control
- Admin and Finance roles only
- Requires authentication
- Session timeout after 30 minutes
- All actions are logged

### Compliance
- GDPR compliant data handling
- Member data is confidential
- Export files should be secured
- Delete export files after import

---

## Quick Reference Card

```
IMPORT PROCESS:
1. Export CSV from Servant Keeper
2. Go to PLCC Connect → Servant Keeper Integration
3. Click Import tab
4. Select entity type
5. Upload CSV file
6. Click Import Data
7. Review results

EXPORT PROCESS:
1. Go to PLCC Connect → Servant Keeper Integration
2. Click Export tab
3. Select entity type
4. Click Export Data
5. Save CSV file
6. Import into Servant Keeper

TROUBLESHOOTING:
• Check CSV format
• Verify required fields
• Review error messages
• Check sync history
• Contact admin if needed

SUPPORT:
• Email: support@awc.org
• Phone: (555) 123-4567
• Documentation: awc.org/help
```

---

## Need More Help?

**Resources:**
- Video Tutorial: "Servant Keeper Integration" (8 min)
- Sample CSV Templates
- Field Mapping Guide

**Support:**
- Email: support@awc.org
- Training: Monthly integration workshop
- Documentation: Complete integration guide

**Common Questions:**
- How often should I sync?
- What if data doesn't match?
- Can I undo an import?
- How do I fix failed records?

---

> "Changing Hearts. Transforming Lives."
