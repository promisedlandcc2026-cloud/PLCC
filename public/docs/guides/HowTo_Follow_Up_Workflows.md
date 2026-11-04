# How-To Guide: Setting Up Follow-Up Workflows
**Promised Land Christian Center (PLCC)**  
**For:** Ministry Leaders, Admin Staff, Pastors  
**Last Updated:** April 21, 2026

---

## What You'll Learn
This guide shows you how to create automated follow-up workflows that nurture visitors, engage members, and ensure no one falls through the cracks.

---

## What Are Follow-Up Workflows?

**Workflows** are automated sequences of follow-up actions that trigger based on events like:
- New visitor attends service
- Member misses multiple services
- Prayer request is submitted
- Team application is received
- Event registration is completed

**Each workflow contains:**
- Multiple steps (emails, SMS, tasks)
- Time delays between steps
- Templates for consistent messaging
- Automatic assignment to staff

---

## Quick Start

1. Create templates for your messages
2. Build a workflow with multiple steps
3. Activate the workflow
4. Monitor results and adjust

---

## Step 1: Create Message Templates

### Why Templates First?
Templates ensure consistent, professional communication and save time when building workflows.

### Creating an Email Template

**Navigate:**
1. Go to **Follow-Ups → Templates**
2. Click "+ New Template"

**Configure Template:**
- **Name**: "New Visitor Welcome Email"
- **Type**: Email
- **Subject**: "Welcome to PLCC! We're glad you visited"
- **Content**: Write your message

**Example Email Template:**
```
Subject: Welcome to PLCC! We're glad you visited

Hi [First Name],

Thank you for visiting Promised Land Christian Center! We're so glad you joined us for worship.

We'd love to get to know you better and help you feel at home in our church family. Here are some ways to connect:

• Join us for Coffee & Connect this Sunday at 9:00 AM
• Attend our Next Steps class on the first Sunday of each month
• Connect with a small group in your area

If you have any questions or need anything, please don't hesitate to reach out. We're here for you!

Blessings,
[Pastor Name]
Promised Land Christian Center

"Where Everybody Is Somebody and Jesus Christ is Lord"
```

**Save Template**

---

### Creating an SMS Template

**Configure:**
- **Name**: "New Visitor Text Follow-Up"
- **Type**: SMS
- **Content**: Keep it short (160 characters max)

**Example SMS Template:**
```
Hi [First Name]! Thanks for visiting PLCC. We'd love to see you again this Sunday at 10am. Reply with any questions! - Pastor [Name]
```

---

### Creating a Task Template

**Configure:**
- **Name**: "Call New Visitor"
- **Type**: Task
- **Content**: Instructions for staff

**Example Task Template:**
```
TASK: Call New Visitor

Contact: [First Name] [Last Name]
Phone: [Phone Number]

SCRIPT:
"Hi [First Name], this is [Your Name] from Promised Land Christian Center. I wanted to personally thank you for visiting us last Sunday. Do you have a quick minute to chat?"

GOALS:
- Thank them for visiting
- Answer any questions
- Invite to upcoming events
- Offer to connect with small group

NOTES:
- Be warm and genuine
- Don't pressure
- Listen more than talk
- Document conversation in system
```

---

## Step 2: Build Your First Workflow

### Navigate to Workflows

1. Go to **Follow-Ups → Workflows**
2. Click "+ Create Workflow"

### Configure Workflow Basics

**Enter Details:**
- **Name**: "New Visitor Follow-Up Sequence"
- **Description**: "7-day automated follow-up for first-time visitors"
- **Trigger**: Manual (when visitor is marked in system)
- **Status**: Active

---

### Add Workflow Steps

**Step 1: Immediate Welcome Email**
1. Click "+ Add Step"
2. Configure:
   - **Step Name**: "Welcome Email"
   - **Type**: Email
   - **Delay**: 0 days (immediate)
   - **Template**: Select "New Visitor Welcome Email"
3. Save step

**Step 2: Personal Phone Call**
1. Click "+ Add Step"
2. Configure:
   - **Step Name**: "Personal Call"
   - **Type**: Task
   - **Delay**: 1 day
   - **Assign To**: Pastoral Care Team
   - **Template**: Select "Call New Visitor"
3. Save step

**Step 3: Follow-Up Text**
1. Click "+ Add Step"
2. Configure:
   - **Step Name**: "Text Reminder"
   - **Type**: SMS
   - **Delay**: 3 days
   - **Template**: Select "New Visitor Text Follow-Up"
3. Save step

**Step 4: Event Invitation**
1. Click "+ Add Step"
2. Configure:
   - **Step Name**: "Invite to Next Steps Class"
   - **Type**: Email
   - **Delay**: 7 days
   - **Template**: Select "Next Steps Invitation"
3. Save step

---

### Review Workflow Timeline

**Your workflow now looks like:**
```
Day 0: Welcome Email (automatic)
Day 1: Personal Call (task assigned to staff)
Day 3: Text Message (automatic)
Day 7: Next Steps Invitation (automatic)
```

**Save Workflow**

---

## Step 3: Activate and Use Workflows

### Manual Trigger

**When a new visitor attends:**
1. Go to **People → Connect Cards**
2. Find the visitor's card
3. Click "Start Workflow"
4. Select "New Visitor Follow-Up Sequence"
5. Click "Start"

**What Happens:**
- Day 0: Email sends immediately
- Day 1: Task appears for pastoral care team
- Day 3: Text message sends automatically
- Day 7: Next Steps email sends automatically

---

### Monitor Progress

**View Active Workflows:**
1. Go to **Follow-Ups → Active**
2. See all people in workflows
3. View which step they're on
4. See completion status

**Track Tasks:**
1. Go to **Follow-Ups → Tasks**
2. See all assigned tasks
3. Mark tasks complete
4. Add notes about interactions

---

## Pre-Built Workflow Examples

### Example 1: Missed Service Follow-Up

**Purpose:** Re-engage members who haven't attended in 3+ weeks

**Steps:**
1. **Day 0**: "We Miss You" email
2. **Day 2**: Task assigned to small group leader to call
3. **Day 5**: Text message checking in
4. **Day 10**: Pastor personal call (if still no response)

---

### Example 2: Prayer Request Follow-Up

**Purpose:** Show care for those who submitted prayer requests

**Steps:**
1. **Day 0**: "We're Praying" confirmation email
2. **Day 3**: Task for prayer team to call
3. **Day 7**: "Still Praying" encouragement email
4. **Day 14**: Check-in text message
5. **Day 30**: "Testimony Request" email (if answered prayer)

---

### Example 3: Team Application Process

**Purpose:** Process volunteer applications efficiently

**Steps:**
1. **Day 0**: "Application Received" confirmation email
2. **Day 1**: Task for ministry leader to review application
3. **Day 3**: Background check initiation (if approved)
4. **Day 7**: Interview scheduling email
5. **Day 14**: Orientation invitation (if accepted)

---

### Example 4: Event Registration Follow-Up

**Purpose:** Keep registrants engaged before event

**Steps:**
1. **Day 0**: Registration confirmation email
2. **Day -7**: "One Week Away" reminder email
3. **Day -3**: Event details and what to bring
4. **Day -1**: "See You Tomorrow" text message
5. **Day +1**: "Thank You for Attending" email
6. **Day +3**: Feedback survey

---

## Advanced Features

### Conditional Steps

**Show different steps based on responses:**

Example: If visitor indicates interest in small groups, add extra step:
1. Click "Add Condition" on step
2. Set rule: IF "Interested in Small Groups" = "Yes"
3. THEN send "Small Group Options" email
4. ELSE skip this step

---

### Workflow Branching

**Create different paths based on actions:**

Example: After welcome email:
- **If opened**: Continue to next step
- **If not opened**: Send follow-up email
- **If clicked link**: Fast-track to personal call

---

### Stop Conditions

**Automatically stop workflow if:**
- Person becomes a member
- Person requests no contact
- Person completes desired action
- Workflow goal is achieved

---

## Best Practices

### Timing
- **Don't overwhelm**: Space steps appropriately
- **Be timely**: Follow up within 24-48 hours of trigger
- **Respect boundaries**: Stop if person requests
- **Consider time zones**: Schedule sends appropriately

### Content
- **Personalize**: Use merge fields ([First Name], etc.)
- **Be genuine**: Write like a real person, not a robot
- **Clear CTA**: Each message should have one clear action
- **Mobile-friendly**: Most people read on phones

### Assignment
- **Right person**: Assign tasks to appropriate team
- **Manageable load**: Don't overwhelm volunteers
- **Clear instructions**: Task templates should be detailed
- **Follow-up**: Monitor task completion

### Measurement
- **Track metrics**: Open rates, response rates, completion
- **Adjust timing**: Test different delays
- **Refine content**: Improve based on responses
- **Document results**: Note what works

---

## Monitoring and Optimization

### Weekly Review

**Check:**
- [ ] How many workflows are active?
- [ ] What's the completion rate?
- [ ] Are tasks being completed on time?
- [ ] Any bottlenecks or issues?

### Monthly Analysis

**Review:**
- [ ] Which workflows are most effective?
- [ ] What's the conversion rate (visitor → member)?
- [ ] Are people responding positively?
- [ ] What needs adjustment?

### Continuous Improvement

**Actions:**
- Test different subject lines
- Adjust timing between steps
- Refine message content
- Add or remove steps
- Update templates based on feedback

---

## Troubleshooting

### "Workflow Not Starting"
**Check:**
- Workflow status is "Active" not "Draft"
- Trigger conditions are met
- Person has required contact info (email/phone)
- No duplicate workflows for same person

### "Emails Not Sending"
**Check:**
- Email template is complete
- Person has valid email address
- Email server is configured
- Check spam folder
- Verify email quota not exceeded

### "Tasks Not Appearing"
**Check:**
- Task is assigned to correct person/team
- Assignee has proper permissions
- Delay period has passed
- Workflow hasn't been stopped

### "Too Many Workflows Active"
**Solution:**
- Review and close completed workflows
- Set automatic stop conditions
- Archive old workflows
- Consolidate similar workflows

---

## Quick Reference

### Workflow Types
- **New Visitor**: Welcome and integrate
- **Missed Service**: Re-engage inactive members
- **Prayer Request**: Show care and follow-up
- **Team Application**: Process volunteers
- **Event Registration**: Keep attendees engaged
- **Discipleship**: Nurture spiritual growth

### Step Types
- **Email**: Automated email from template
- **SMS**: Text message (keep under 160 chars)
- **Task**: Assigned action for staff
- **Wait**: Delay before next step

### Best Delays
- **Immediate**: Welcome messages
- **1 day**: Personal follow-up
- **3 days**: Reminder or check-in
- **7 days**: Next step invitation
- **14 days**: Long-term follow-up
- **30 days**: Milestone check-in

---

## Need More Help?

**Resources:**
- Video Tutorial: "Follow-Up Workflows Masterclass" (15 min)
- Template Library: 20+ pre-written templates
- Workflow Examples: Copy and customize

**Support:**
- Email: support@awc.org
- Training: Monthly workflow workshop
- Documentation: Complete workflow guide

---

> "Where Everybody Is Somebody and Jesus Christ is Lord."
