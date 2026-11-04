# How-To Guide: Building Custom Forms
**Promised Land Christian Center (PLCC)**  
**For:** Admin Staff, Ministry Leaders  
**Last Updated:** April 21, 2026

---

## What You'll Learn
This guide shows you how to create custom forms for event registration, surveys, applications, and more using PLCC Connect's Form Builder.

---

## Quick Start

1. Go to **Forms → Form Builder**
2. Click "Create New Form"
3. Add fields by dragging and dropping
4. Publish and share the link

---

## Step-by-Step: Creating Your First Form

### Step 1: Start a New Form

**Navigate to Form Builder:**
1. Click "Forms" in main navigation
2. Select "Form Builder"
3. Click the "+ Create New Form" button

**Enter Basic Information:**
- **Form Title**: Give it a clear name (e.g., "Youth Camp Registration 2026")
- **Description**: Brief explanation of the form's purpose
- **Category**: Select type (Event, Survey, Application, General)
- **Status**: Start as "Draft" (not visible to public yet)

---

### Step 2: Add Form Fields

**Available Field Types:**

**Text Fields:**
- **Short Text**: Single line (names, email, phone)
- **Long Text**: Multiple lines (comments, testimonies)
- **Email**: Validates email format
- **Phone**: Validates phone format
- **Number**: Numeric input only

**Selection Fields:**
- **Dropdown**: Choose one from list
- **Radio Buttons**: Choose one option
- **Checkboxes**: Choose multiple options
- **Yes/No**: Simple binary choice

**Special Fields:**
- **Date**: Calendar picker
- **Time**: Time selector
- **File Upload**: Attach documents/photos
- **Signature**: Digital signature capture
- **Section Header**: Organize form into sections

**Adding a Field:**
1. Click "+ Add Field" button
2. Select field type from list
3. Configure field settings:
   - **Label**: Question or field name
   - **Placeholder**: Example text (optional)
   - **Required**: Make it mandatory
   - **Help Text**: Additional instructions
4. Click "Save Field"

---

### Step 3: Configure Field Options

**For Dropdown/Radio/Checkbox Fields:**

1. Click "Add Options"
2. Enter each choice:
   - Option 1: "Yes, I'll attend"
   - Option 2: "No, I cannot attend"
   - Option 3: "Maybe, not sure yet"
3. Set default selection (optional)
4. Allow "Other" option (optional)

**Example: T-Shirt Size Field**
```
Field Type: Dropdown
Label: "T-Shirt Size"
Required: Yes
Options:
  - Youth Small
  - Youth Medium
  - Youth Large
  - Adult Small
  - Adult Medium
  - Adult Large
  - Adult XL
  - Adult 2XL
```

---

### Step 4: Organize Your Form

**Add Section Headers:**
1. Click "+ Add Field"
2. Select "Section Header"
3. Enter section title: "Personal Information"
4. Add description if needed

**Reorder Fields:**
- Drag and drop fields to rearrange
- Group related fields together
- Put required fields first

**Example Form Structure:**
```
SECTION: Personal Information
  - First Name (required)
  - Last Name (required)
  - Email (required)
  - Phone (required)

SECTION: Event Details
  - Will you attend? (required)
  - Number of guests
  - Dietary restrictions

SECTION: Additional Information
  - How did you hear about this event?
  - Comments or questions
```

---

### Step 5: Configure Form Settings

**Access Settings:**
1. Click "Form Settings" tab
2. Configure options:

**Availability:**
- **Start Date**: When form opens
- **End Date**: When form closes
- **Limit Responses**: Max number of submissions
- **One Response Per Person**: Prevent duplicates

**Notifications:**
- **Send Confirmation Email**: To submitter
- **Notify Admin**: When form is submitted
- **Admin Email**: Where to send notifications

**Appearance:**
- **Theme**: Choose color scheme
- **Logo**: Add church logo
- **Thank You Message**: Custom completion message

**Privacy:**
- **Public**: Anyone can access
- **Members Only**: Requires login
- **Specific Roles**: Limit to certain roles

---

### Step 6: Preview and Test

**Preview Your Form:**
1. Click "Preview" button
2. View form as users will see it
3. Check:
   - All fields display correctly
   - Required fields are marked
   - Instructions are clear
   - Mobile view looks good

**Test Submission:**
1. Fill out the form completely
2. Submit as a test
3. Verify:
   - Confirmation message appears
   - Email notifications sent
   - Data appears in submissions
4. Delete test submission

---

### Step 7: Publish Your Form

**Final Checks:**
- [ ] All fields are correct
- [ ] Required fields are marked
- [ ] Instructions are clear
- [ ] Settings are configured
- [ ] Test submission successful

**Publish:**
1. Click "Publish Form" button
2. Form status changes to "Active"
3. Form is now live and accessible

**Get the Link:**
1. Click "Share" button
2. Copy the form URL
3. Share via:
   - Email
   - Text message
   - Social media
   - Church website
   - Printed QR code

---

## Form Examples

### Example 1: Event Registration Form

**Fields:**
1. First Name (required, short text)
2. Last Name (required, short text)
3. Email (required, email)
4. Phone (required, phone)
5. Number of Attendees (required, number)
6. Dietary Restrictions (long text)
7. Emergency Contact Name (short text)
8. Emergency Contact Phone (phone)
9. Liability Waiver (checkbox, required)
10. Signature (signature, required)

---

### Example 2: Volunteer Application

**Fields:**
1. **Section: Personal Information**
   - Full Name (required)
   - Email (required)
   - Phone (required)
   - Date of Birth (date)

2. **Section: Ministry Interest**
   - Which ministry? (dropdown, required)
     - Children's Ministry
     - Youth Ministry
     - Worship Team
     - Hospitality
     - Media Team
   - Why do you want to serve? (long text, required)
   - Previous experience (long text)

3. **Section: Availability**
   - Available Days (checkboxes)
     - Sunday Morning
     - Sunday Evening
     - Wednesday Evening
     - Special Events
   - Start Date (date)

4. **Section: References**
   - Reference 1 Name (short text)
   - Reference 1 Phone (phone)
   - Reference 2 Name (short text)
   - Reference 2 Phone (phone)

5. **Section: Agreement**
   - Background check consent (checkbox, required)
   - Commitment agreement (checkbox, required)
   - Signature (signature, required)

---

### Example 3: Feedback Survey

**Fields:**
1. **Section: Service Experience**
   - How would you rate today's service? (radio)
     - Excellent
     - Good
     - Fair
     - Needs Improvement
   - What did you enjoy most? (long text)
   - What could be improved? (long text)

2. **Section: Facilities**
   - Were facilities clean? (yes/no)
   - Was signage helpful? (yes/no)
   - Parking experience (dropdown)

3. **Section: Additional Feedback**
   - Other comments (long text)
   - May we contact you? (yes/no)
   - Email (email, conditional on previous answer)

---

## Managing Form Submissions

### Viewing Responses

**Step 1:** Access Submissions
1. Go to **Forms → Submissions**
2. Select your form from list
3. View all responses

**Step 2:** Review Individual Submissions
- Click on any submission to view details
- See all answers
- View submission timestamp
- Note submitter information

**Step 3:** Export Data
1. Click "Export" button
2. Choose format:
   - Excel (.xlsx)
   - CSV (.csv)
   - PDF (individual responses)
3. Download file
4. Open in Excel or Google Sheets

---

### Analyzing Results

**View Summary Statistics:**
- Total submissions
- Completion rate
- Average completion time
- Response breakdown by field

**Filter Responses:**
- By date range
- By specific answers
- By completion status

**Generate Reports:**
- Create charts and graphs
- Share with leadership
- Track trends over time

---

## Advanced Features

### Conditional Logic

**Show/Hide Fields Based on Answers:**

Example: Show "Dietary Restrictions" only if "Attending Meal" is "Yes"

1. Click on "Dietary Restrictions" field
2. Click "Add Condition"
3. Set rule:
   - IF "Attending Meal" = "Yes"
   - THEN show this field
4. Save condition

---

### Payment Integration (If Enabled)

**Add Payment Field:**
1. Add "Payment" field type
2. Set amount:
   - Fixed amount
   - Variable amount
   - Dropdown with prices
3. Configure payment processor
4. Test payment flow

---

### Multi-Page Forms

**Break Long Forms into Pages:**
1. Click "Add Page Break"
2. Name each page
3. Add progress indicator
4. Allow save and continue later

---

## Tips for Great Forms

### Keep It Short
- Only ask essential questions
- Combine related fields
- Use conditional logic to hide unnecessary fields

### Make It Clear
- Use simple language
- Provide examples in placeholders
- Add help text for complex questions
- Group related fields together

### Mobile-Friendly
- Test on phone before publishing
- Use appropriate field types
- Avoid too many options in dropdowns
- Make buttons large enough to tap

### Reduce Friction
- Mark only truly required fields
- Pre-fill known information
- Allow save and continue later
- Provide clear error messages

---

## Troubleshooting

### "Form Won't Publish"
**Check:**
- All required settings are filled
- At least one field exists
- Form has a title
- No duplicate field names

### "Submissions Not Appearing"
**Check:**
- Form is published (not draft)
- Correct form is selected
- Date range filter
- Refresh the page

### "Email Notifications Not Sending"
**Check:**
- Email address is correct
- Notifications are enabled in settings
- Check spam folder
- Verify email server is working

### "Form Link Not Working"
**Check:**
- Form is published
- Link was copied completely
- Form hasn't expired
- User has required permissions

---

## Best Practices Checklist

**Before Publishing:**
- [ ] Test form on desktop
- [ ] Test form on mobile
- [ ] Submit test response
- [ ] Verify notifications work
- [ ] Check thank you message
- [ ] Review all field labels
- [ ] Confirm required fields
- [ ] Set appropriate permissions

**After Publishing:**
- [ ] Share link with intended audience
- [ ] Monitor submissions regularly
- [ ] Respond to submissions promptly
- [ ] Export data for records
- [ ] Close form when appropriate

---

## Need More Help?

**Resources:**
- Video Tutorial: "Form Builder Basics" (10 min)
- Template Library: Pre-built forms to customize
- Support: support@awc.org

**Training:**
- Monthly Form Builder Workshop
- One-on-one training available
- Online documentation

---

> "Where Everybody Is Somebody and Jesus Christ is Lord."
