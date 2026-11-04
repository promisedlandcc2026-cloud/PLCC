import { Member, Household, ChatMessage, PrayerRequest, ChurchNotification } from '../types';

export const SANCTUARY_BANNER = '/src/assets/images/awc_sanctuary_banner_1791490373882.jpg';
export const PASTOR_AVATAR = '/src/assets/images/pastor_marcus_avatar_1791490384804.jpg';
export const KEISHA_AVATAR = '/src/assets/images/keisha_leader_avatar_1791490393238.jpg';

export const INITIAL_MEMBERS: Member[] = [
  {
    id: 'mem_1',
    username: 'pastor.marcus',
    fullName: 'Pastor Marcus Vance',
    preferredName: 'Pastor Marcus',
    title: 'Senior Pastor & Overseer',
    role: 'SUPER_ADMIN',
    avatarUrl: PASTOR_AVATAR,
    summary: 'Walking by faith, loving people passionately. Changing Hearts. Transforming Lives.',
    bio: `Called to pastor Promised Land Christian Center with a passion for transformative biblical teaching, discipleship, and community empowerment. Pastor Marcus holds a Master of Divinity and has been shepherding PLCC since its founding. 

His heart beats for raising Kingdom leaders, fostering deep family connections, and ensuring every single soul walking through our doors knows they are seen, valued, and loved by God. Married to Lady Eleanor for 18 glorious years.`,
    email: 'marcus.vance@awcvault.org',
    phone: '(312) 555-0142',
    privacy: {
      showEmail: true,
      showPhone: true,
      showGiving: false,
    },
    joinDate: 'September 2015',
    lastActive: '5 mins ago',
    age: 46,
    relationshipTitle: 'Father / Head of Household',
    householdId: 'hh_1',
    householdRole: 'Head of Household',
    connectionStatus: 'connected',
    isFollowing: true,
    isOnline: true,
    volunteerBadges: [
      {
        id: 'vb_pastoral',
        name: 'Pastoral Care Pillar',
        category: 'Outreach',
        tier: 'Leader',
        hours: 1200,
        iconName: 'Shield',
        description: 'Over 1,000 pastoral counseling and community prayer hours logged.',
        earnedDate: '2023-01-15'
      },
      {
        id: 'vb_teacher',
        name: 'Master Teacher',
        category: 'Worship',
        tier: 'Gold',
        hours: 850,
        iconName: 'BookOpen',
        description: 'Expository bible instruction and leadership development series.',
        earnedDate: '2023-08-20'
      }
    ],
    journeyMilestones: [
      {
        id: 'jm_1_1',
        title: 'Joined PLCC / Church Founding',
        date: 'Sept 12, 2015',
        category: 'Membership',
        description: 'Co-founded Promised Land Christian Center alongside 28 pioneer families in South Chicago.',
        officiatedBy: 'PLCC Founding Board'
      },
      {
        id: 'jm_1_2',
        title: 'Baptized & Consecrated Senior Pastor',
        date: 'Oct 18, 2015',
        category: 'Ordination',
        description: 'Consecrated as Senior Pastor and Overseer of the church flock.',
        officiatedBy: 'Bishop H. Daniels'
      },
      {
        id: 'jm_1_3',
        title: 'South Boulevard Sanctuary Dedication',
        date: 'May 20, 2018',
        category: 'Milestone' as any,
        description: 'Opened and dedicated our permanent 650-seat worship sanctuary debt-free.',
        officiatedBy: 'Pastoral Council'
      },
      {
        id: 'jm_1_4',
        title: 'Ministry Lead Appointment - Regional Fellowship',
        date: 'June 10, 2023',
        category: 'Leadership',
        description: 'Appointed Regional Convener for Urban Church Multiplication Initiative.',
        officiatedBy: 'Metropolitan Fellowship'
      }
    ],
    attendanceStats: {
      totalServicesThisYear: 42,
      streakWeeks: 24,
      lastCheckedIn: 'Last Sunday, 10:30 AM',
      serviceType: 'Main Sanctuary Worship'
    },
    givingSummary: {
      status: 'Faithful',
      pledgeCampaign: '2026 Sanctuary Expansion',
      ytdTithe: 14200
    },
    recentUpdates: [
      {
        id: 'stat_1',
        authorId: 'mem_1',
        content: 'Excited for this Sunday\'s word: "Anchored in the Storm". Come ready for breakthroughs and fellowship afterwards in the foyer!',
        timestamp: 'Yesterday at 3:15 PM',
        amenCount: 38,
        hasAmened: true
      },
      {
        id: 'stat_2',
        authorId: 'mem_1',
        content: 'Proud of our Outreach Team feeding over 220 families yesterday morning. Thank you team!',
        timestamp: '3 days ago',
        amenCount: 54,
        hasAmened: true
      }
    ]
  },
  {
    id: 'mem_2',
    username: 'keisha.johnson',
    fullName: 'Sister Keisha Johnson',
    preferredName: 'Keisha',
    title: 'Head of Hospitality & Usher Ministry',
    role: 'LEADER',
    avatarUrl: KEISHA_AVATAR,
    summary: 'Joyful servant, greeting every soul with a genuine smile and open arms.',
    bio: `A faithful worshipper and organizer at Promised Land Christian Center for over 6 years. Keisha leads our Hospitality Team and Greeters, ensuring every guest feels the warmth of Christ immediately upon stepping onto campus.

When not coordinating Sunday logistics, she mentors young women through our Esther's Circle fellowship and coordinates our annual Community Harvest drive.`,
    email: 'keisha.j@awcfamily.net',
    phone: '(312) 555-0819',
    privacy: {
      showEmail: true,
      showPhone: true,
      showGiving: false,
    },
    joinDate: 'March 2020',
    lastActive: '12 mins ago',
    age: 41,
    relationshipTitle: 'Mother / Head of Household',
    householdId: 'hh_2',
    householdRole: 'Head of Household',
    connectionStatus: 'connected',
    isFollowing: true,
    isOnline: true,
    volunteerBadges: [
      {
        id: 'vb_hosp_lead',
        name: 'Hospitality Lead',
        category: 'Hospitality',
        tier: 'Leader',
        hours: 340,
        iconName: 'HeartHandshake',
        description: 'Led 50+ Sunday greeting shifts and volunteer onboarding seminars.',
        earnedDate: '2024-02-10'
      },
      {
        id: 'vb_usher_gold',
        name: 'Usher Guard of Honor',
        category: 'Ushering',
        tier: 'Gold',
        hours: 210,
        iconName: 'Users',
        description: 'Excellence in sanctuary order, seating coordination, and safety.',
        earnedDate: '2024-11-04'
      }
    ],
    journeyMilestones: [
      {
        id: 'jm_2_1',
        title: 'Water Baptism',
        date: 'Nov 8, 2019',
        category: 'Baptism',
        description: 'Baptized in faith during Annual Fall Harvest Baptismal celebration.',
        officiatedBy: 'Pastor Marcus Vance'
      },
      {
        id: 'jm_2_2',
        title: 'Joined PLCC',
        date: 'March 15, 2020',
        category: 'Membership',
        description: 'Completed New Believers Foundations and officially received into church fellowship.',
        officiatedBy: 'Pastoral Council'
      },
      {
        id: 'jm_2_3',
        title: 'Appointed Sanctuary Head Usher',
        date: 'June 12, 2022',
        category: 'Leadership',
        description: 'Appointed to coordinate sanctuary seating order, hospitality, and safety teams.',
        officiatedBy: 'Deacon Charles Washington'
      },
      {
        id: 'jm_2_4',
        title: 'Ministry Lead Appointment - Hospitality',
        date: 'Feb 10, 2024',
        category: 'Leadership',
        description: 'Commissioned as Ministry Overseer of Guest Experience & Esther\'s Circle Fellowship.',
        officiatedBy: 'Pastor Marcus Vance'
      }
    ],
    attendanceStats: {
      totalServicesThisYear: 39,
      streakWeeks: 18,
      lastCheckedIn: 'Last Sunday, 10:15 AM',
      serviceType: 'Main Sanctuary Worship'
    },
    givingSummary: {
      status: 'Faithful',
      pledgeCampaign: 'Community Food Pantry Initiative',
      ytdTithe: 4850
    },
    recentUpdates: [
      {
        id: 'stat_3',
        authorId: 'mem_2',
        content: 'We need 3 more smiling greeters for our 1st Service this upcoming Communion Sunday! Message me if your heart is open to serve.',
        timestamp: 'Today at 9:30 AM',
        amenCount: 19,
        hasAmened: false
      }
    ]
  },
  {
    id: 'mem_3',
    username: 'david.okafor',
    fullName: 'Brother David Okafor',
    preferredName: 'David',
    title: 'Sound & Audio Engineer',
    role: 'VOLUNTEER',
    avatarUrl: '',
    summary: 'Audio engineer devoted to creating an immersive sanctuary atmosphere.',
    bio: `Tech enthusiast and acoustic engineer serving in the PLCC Media & Broadcast ministry. Brother David helps manage live stream mixing, in-ear monitors, and sound reinforcement for Sunday services and mid-week prayer revival.

He loves studying scripture, playing bass, and hosting youth small groups on Thursday evenings.`,
    email: 'david.o@soundkingdom.io',
    phone: '(312) 555-4421',
    privacy: {
      showEmail: true,
      showPhone: false,
      showGiving: false,
    },
    joinDate: 'November 2021',
    lastActive: '1 hour ago',
    householdId: 'hh_3',
    householdRole: 'Head of Household',
    connectionStatus: 'pending_sent',
    isFollowing: false,
    isOnline: false,
    volunteerBadges: [
      {
        id: 'vb_tech_master',
        name: 'Broadcast Sound Master',
        category: 'Tech & Media',
        tier: 'Gold',
        hours: 195,
        iconName: 'Radio',
        description: 'Over 150 hours live-mixing services and special conferences.',
        earnedDate: '2024-06-18'
      }
    ],
    journeyMilestones: [
      {
        id: 'jm_3_1',
        title: 'Joined PLCC',
        date: 'Nov 21, 2021',
        category: 'Membership',
        description: 'Welcomed into church membership and sound ministry small group.',
        officiatedBy: 'Pastor Marcus Vance'
      },
      {
        id: 'jm_3_2',
        title: 'Water Baptism',
        date: 'Jan 16, 2022',
        category: 'Baptism',
        description: 'Public declaration of faith in the sanctuary baptistery.',
        officiatedBy: 'Pastor Marcus Vance'
      },
      {
        id: 'jm_3_3',
        title: 'Ministry Lead Appointment - Audio & Broadcast',
        date: 'June 18, 2024',
        category: 'Leadership',
        description: 'Commissioned as Chief Audio Engineer for live services and livestream broadcasts.',
        officiatedBy: 'Media Director'
      }
    ],
    attendanceStats: {
      totalServicesThisYear: 36,
      streakWeeks: 12,
      lastCheckedIn: 'Wednesday Midweek, 7:00 PM',
      serviceType: 'Midweek Revival & Bible Study'
    },
    givingSummary: {
      status: 'Active',
      pledgeCampaign: 'Media Equipment Upgrade',
      ytdTithe: 3200
    },
    recentUpdates: [
      {
        id: 'stat_4',
        authorId: 'mem_3',
        content: 'The new sound calibration for the choir mics is complete. Sunday is going to sound crystal clear for the glory of God!',
        timestamp: '2 days ago',
        amenCount: 22,
        hasAmened: true
      }
    ]
  },
  {
    id: 'mem_4',
    username: 'eleanor.vance',
    fullName: 'Lady Eleanor Vance',
    preferredName: 'First Lady Eleanor',
    title: 'Director of Women\'s Ministry & Counseling',
    role: 'LEADER',
    avatarUrl: '',
    summary: 'Intercessor, educator, and advocate for flourishing families.',
    bio: `Serving alongside Pastor Marcus with grace and tenacity. Lady Eleanor directs our Women of Faith ministry, marital counseling workshops, and the Children's Kingdom Academy.

Passionate about mental health awareness in the church, maternal well-being, and raising the next generation in biblical literacy.`,
    email: 'eleanor.vance@awcvault.org',
    phone: '(312) 555-0143',
    privacy: {
      showEmail: true,
      showPhone: true,
      showGiving: false,
    },
    joinDate: 'September 2015',
    lastActive: '45 mins ago',
    age: 44,
    relationshipTitle: 'Mother / Co-Head',
    householdId: 'hh_1',
    householdRole: 'Spouse',
    connectionStatus: 'connected',
    isFollowing: true,
    isOnline: true,
    volunteerBadges: [
      {
        id: 'vb_women_lead',
        name: 'Women\'s Ministry Champion',
        category: 'Outreach',
        tier: 'Leader',
        hours: 480,
        iconName: 'Sparkles',
        description: 'Organized 8 annual women\'s retreats and mentorship cohorts.',
        earnedDate: '2023-04-12'
      },
      {
        id: 'vb_child_silver',
        name: 'Kingdom Kids Educator',
        category: 'Children',
        tier: 'Silver',
        hours: 140,
        iconName: 'Smile',
        description: 'Curriculum development and teacher training for preschool.',
        earnedDate: '2024-03-01'
      }
    ],
    journeyMilestones: [
      {
        id: 'jm_4_1',
        title: 'Water Baptism',
        date: 'April 19, 2004',
        category: 'Baptism',
        description: 'Baptized in faith and committed to lifelong gospel service.',
        officiatedBy: 'Rev. E. Sterling'
      },
      {
        id: 'jm_4_2',
        title: 'Joined PLCC / Church Co-Founding',
        date: 'Sept 12, 2015',
        category: 'Membership',
        description: 'Founded PLCC alongside Pastor Marcus and community prayer partners.',
        officiatedBy: 'Founding Presbytery'
      },
      {
        id: 'jm_4_3',
        title: 'Ministry Lead Appointment - Women of Faith',
        date: 'Nov 4, 2016',
        category: 'Leadership',
        description: 'Commissioned as Director of Women\'s Ministries and Marriage Mentorship.',
        officiatedBy: 'Pastor Marcus Vance'
      }
    ],
    attendanceStats: {
      totalServicesThisYear: 41,
      streakWeeks: 24,
      lastCheckedIn: 'Last Sunday, 10:30 AM',
      serviceType: 'Main Sanctuary Worship'
    },
    givingSummary: {
      status: 'Faithful',
      pledgeCampaign: '2026 Sanctuary Expansion',
      ytdTithe: 14200
    },
    recentUpdates: [
      {
        id: 'stat_5',
        authorId: 'mem_4',
        content: 'Registration for our Spring Women\'s Tea & Testimony is now open! Come ready to be refreshed in spirit.',
        timestamp: 'Yesterday at 11:00 AM',
        amenCount: 41,
        hasAmened: true
      }
    ]
  },
  {
    id: 'mem_5',
    username: 'charles.washington',
    fullName: 'Deacon Charles Washington',
    preferredName: 'Deacon Charles',
    title: 'Chairman of the Deacon Board & Facilities',
    role: 'LEADER',
    avatarUrl: '',
    summary: 'Humble servant ensuring the Lord\'s house is welcoming and well-maintained.',
    bio: `Deacon Charles has been a cornerstone member of PLCC for 10 years. Retired master electrician and community mentor, he oversees church campus maintenance, benevolence distribution, and baptismal preparation.`,
    email: 'charles.w@awcdeacons.org',
    phone: '(312) 555-7793',
    privacy: {
      showEmail: false,
      showPhone: true,
      showGiving: false,
    },
    joinDate: 'January 2016',
    lastActive: '3 hours ago',
    householdId: 'hh_4',
    householdRole: 'Head of Household',
    connectionStatus: 'none',
    isFollowing: false,
    isOnline: false,
    volunteerBadges: [
      {
        id: 'vb_fac_lead',
        name: 'Sanctuary Stewardship',
        category: 'Hospitality',
        tier: 'Leader',
        hours: 520,
        iconName: 'Wrench',
        description: 'Maintained sanctuary lighting, sound booth acoustics, and safety code.',
        earnedDate: '2022-11-19'
      }
    ],
    journeyMilestones: [
      {
        id: 'jm_5_1',
        title: 'Joined PLCC',
        date: 'Jan 10, 2016',
        category: 'Membership',
        description: 'United with the PLCC congregation after moving from Atlanta.',
        officiatedBy: 'Pastor Marcus Vance'
      },
      {
        id: 'jm_5_2',
        title: 'Ordained as Church Deacon',
        date: 'Oct 15, 2017',
        category: 'Ordination',
        description: 'Ordained to the PLCC Deacon Board through the laying on of hands.',
        officiatedBy: 'Pastor Marcus Vance'
      },
      {
        id: 'jm_5_3',
        title: 'Ministry Lead Appointment - Facilities & Benevolence',
        date: 'Nov 19, 2022',
        category: 'Leadership',
        description: 'Appointed Chairman of Campus Operations and Community Benevolence Fund.',
        officiatedBy: 'Deacon Board'
      }
    ],
    attendanceStats: {
      totalServicesThisYear: 40,
      streakWeeks: 22,
      lastCheckedIn: 'Last Sunday, 8:45 AM',
      serviceType: 'Early Morning Prayer & Setup'
    },
    givingSummary: {
      status: 'Faithful',
      pledgeCampaign: 'Benevolence Outreach Fund',
      ytdTithe: 6100
    },
    recentUpdates: [
      {
        id: 'stat_6',
        authorId: 'mem_5',
        content: 'The heating repairs in the fellowship hall are finished. It is cozy and warm for Wednesday dinner!',
        timestamp: '4 days ago',
        amenCount: 18,
        hasAmened: false
      }
    ]
  },
  {
    id: 'mem_6',
    username: 'maya.sterling',
    fullName: 'Sister Maya Sterling',
    preferredName: 'Maya',
    title: 'Worship Vocalist & Youth Mentor',
    role: 'VOLUNTEER',
    avatarUrl: '',
    summary: 'Lifting up the name of Jesus through praise and mentoring our teens.',
    bio: `Graduate student and worship team alto vocalist. Maya loves leading high-energy praise sessions and facilitating honest group talks with high schoolers during Friday Youth Nights.`,
    email: 'maya.sterling@worshipmail.com',
    phone: '(312) 555-9014',
    privacy: {
      showEmail: true,
      showPhone: false,
      showGiving: false,
    },
    joinDate: 'July 2022',
    lastActive: 'Just now',
    age: 18,
    relationshipTitle: 'Daughter / Youth Leader',
    householdId: 'hh_2',
    householdRole: 'Youth',
    connectionStatus: 'connected',
    isFollowing: true,
    isOnline: true,
    volunteerBadges: [
      {
        id: 'vb_vocal_gold',
        name: 'Worship Team Vocalist',
        category: 'Worship',
        tier: 'Gold',
        hours: 230,
        iconName: 'Music',
        description: 'Regular vocalist for Sunday morning and youth conferences.',
        earnedDate: '2024-05-15'
      },
      {
        id: 'vb_youth_bronze',
        name: 'Youth Ministry Mentor',
        category: 'Children',
        tier: 'Bronze',
        hours: 65,
        iconName: 'Heart',
        description: 'Friday night youth fellowship breakout leader.',
        earnedDate: '2024-09-10'
      }
    ],
    journeyMilestones: [
      {
        id: 'jm_6_1',
        title: 'Water Baptism',
        date: 'April 17, 2022',
        category: 'Baptism',
        description: 'Baptized during Resurrection Sunday worship gathering.',
        officiatedBy: 'Pastor Marcus Vance'
      },
      {
        id: 'jm_6_2',
        title: 'Joined PLCC',
        date: 'July 24, 2022',
        category: 'Membership',
        description: 'Completed membership orientation and youth mentorship intake.',
        officiatedBy: 'Lady Eleanor Vance'
      },
      {
        id: 'jm_6_3',
        title: 'Ministry Lead Appointment - Youth Praise Leader',
        date: 'May 15, 2024',
        category: 'Leadership',
        description: 'Appointed youth worship leader and small group breakout facilitator.',
        officiatedBy: 'Worship Director'
      }
    ],
    attendanceStats: {
      totalServicesThisYear: 35,
      streakWeeks: 9,
      lastCheckedIn: 'Sunday Rehearsal, 8:30 AM',
      serviceType: 'Worship Team Rehearsal & Service'
    },
    givingSummary: {
      status: 'Active',
      pledgeCampaign: 'Youth Summer Camp Fund',
      ytdTithe: 1800
    },
    recentUpdates: [
      {
        id: 'stat_7',
        authorId: 'mem_6',
        content: '"Great is Thy Faithfulness!" What an incredible rehearsal today. Can\'t wait to worship with everyone!',
        timestamp: '3 hours ago',
        amenCount: 31,
        hasAmened: true
      }
    ]
  },
  {
    id: 'mem_7',
    username: 'terrell.lewis',
    fullName: 'Brother Terrell Lewis',
    preferredName: 'Terrell',
    title: 'Active Member & Men\'s Fellowship Member',
    role: 'MEMBER',
    avatarUrl: '',
    summary: 'New believer, father of two, seeking to grow rooted in the Word.',
    bio: `Terrell joined Promised Land Christian Center in early 2024 with his two sons. He works as a logistics coordinator and is actively involved in the Men of Valor monthly breakfast fellowship.`,
    email: 'terrell.lewis@familyconnect.com',
    phone: '(312) 555-3371',
    privacy: {
      showEmail: true,
      showPhone: true,
      showGiving: false,
    },
    joinDate: 'February 2024',
    lastActive: '2 days ago',
    age: 39,
    relationshipTitle: 'Father / Head of Household',
    householdId: 'hh_5',
    householdRole: 'Head of Household',
    connectionStatus: 'none',
    isFollowing: false,
    isOnline: false,
    volunteerBadges: [
      {
        id: 'vb_parking_bronze',
        name: 'Parking & Safety Team',
        category: 'Ushering',
        tier: 'Bronze',
        hours: 24,
        iconName: 'Shield',
        description: 'Sunday morning safe traffic flow & welcoming drivers.',
        earnedDate: '2024-08-11'
      }
    ],
    journeyMilestones: [
      {
        id: 'jm_7_1',
        title: 'Joined PLCC',
        date: 'Feb 18, 2024',
        category: 'Membership',
        description: 'Dedicated family to the church community and began New Believers journey.',
        officiatedBy: 'Pastor Marcus Vance'
      },
      {
        id: 'jm_7_2',
        title: 'Baptized',
        date: 'March 31, 2024',
        category: 'Baptism',
        description: 'Water baptism in the sanctuary on Easter Sunday alongside sons.',
        officiatedBy: 'Pastor Marcus Vance & Deacon Charles'
      },
      {
        id: 'jm_7_3',
        title: 'Men of Valor Ministry Lead Appointment',
        date: 'Aug 11, 2024',
        category: 'Leadership',
        description: 'Appointed Sunday Parking & Greeting Coordinator for brotherhood team.',
        officiatedBy: 'Men\'s Fellowship Lead'
      }
    ],
    attendanceStats: {
      totalServicesThisYear: 28,
      streakWeeks: 6,
      lastCheckedIn: 'Last Sunday, 10:45 AM',
      serviceType: 'Main Sanctuary Worship'
    },
    givingSummary: {
      status: 'Active',
      pledgeCampaign: 'General Ministry Offering',
      ytdTithe: 1450
    },
    recentUpdates: [
      {
        id: 'stat_8',
        authorId: 'mem_7',
        content: 'Thankful for the Men\'s breakfast yesterday. God is doing a work in my heart and my household.',
        timestamp: '5 days ago',
        amenCount: 14,
        hasAmened: false
      }
    ]
  },
  {
    id: 'mem_8',
    username: 'josiah.vance',
    fullName: 'Josiah Vance',
    preferredName: 'Josiah',
    title: 'Kingdom Kids Junior Scholar',
    role: 'MEMBER',
    avatarUrl: '',
    summary: '5th grader, loves singing in Kingdom Kids choir, bible trivia & basketball.',
    bio: `Josiah is 10 years old and active in PLCC Kingdom Kids Academy. He loves Bible trivia, playing soccer on weekends, and learning the acoustic guitar in Sunday school.

He helps with greeting and loves collecting the offering baskets during family worship Sundays.`,
    age: 10,
    dateOfBirth: '2016-04-14',
    relationshipTitle: 'Son (Kingdom Kids)',
    childLock: {
      isLocked: true,
      lockedByParentId: 'mem_1',
      lockedByParentName: 'Pastor Marcus Vance',
      parentPin: '1234',
      hideFromDirectory: true,
      hideContactInfo: true,
      hidePhotos: false,
      ageThreshold: 13,
      lockedAt: 'Oct 1, 2026',
      note: 'Protected under PLCC Minor Privacy Policy (Ages under 13). Directory access restricted to guardians.'
    },
    email: 'josiah.vance@familyvault.org',
    phone: '(312) 555-0142',
    privacy: {
      showEmail: false,
      showPhone: false,
      showGiving: false,
    },
    joinDate: 'September 2016',
    lastActive: 'Today, 2:10 PM',
    householdId: 'hh_1',
    householdRole: 'Child',
    connectionStatus: 'connected',
    isFollowing: true,
    isOnline: true,
    volunteerBadges: [
      {
        id: 'vb_kk_choir',
        name: 'Junior Praise Singer',
        category: 'Worship',
        tier: 'Bronze',
        hours: 32,
        iconName: 'Music',
        description: 'Singing in the Kingdom Kids Christmas and Easter pageants.',
        earnedDate: '2024-04-10'
      },
      {
        id: 'vb_kk_helper',
        name: 'Sunday School Helper',
        category: 'Children',
        tier: 'Bronze',
        hours: 18,
        iconName: 'Sparkles',
        description: 'Helps pass out storybooks and art supplies to younger kids.',
        earnedDate: '2024-06-15'
      }
    ],
    journeyMilestones: [
      {
        id: 'jm_8_1',
        title: 'Baby Dedication Service',
        date: 'May 8, 2016',
        category: 'Baptism',
        description: 'Dedicated to the Lord in the presence of the PLCC congregation.',
        officiatedBy: 'Bishop H. Daniels'
      },
      {
        id: 'jm_8_2',
        title: 'Completed Kingdom Kids Scripture Memory Challenge',
        date: 'June 2, 2024',
        category: 'Discipleship',
        description: 'Memorized 25 Bible verses across Psalms and Proverbs with distinction.',
        officiatedBy: 'Lady Eleanor Vance'
      }
    ],
    attendanceStats: {
      totalServicesThisYear: 39,
      streakWeeks: 21,
      lastCheckedIn: 'Last Sunday, 10:30 AM',
      serviceType: 'Kingdom Kids Class A'
    },
    recentUpdates: [
      {
        id: 'stat_8_1',
        authorId: 'mem_8',
        content: 'I memorized Psalm 23 for Sunday School today! Thank you Mom and Dad for helping me practice.',
        timestamp: '3 days ago',
        amenCount: 26,
        hasAmened: true
      }
    ]
  },
  {
    id: 'mem_9',
    fullName: 'Faith Vance',
    username: 'faith.vance',
    preferredName: 'Faith',
    title: 'Kingdom Kids Pre-K Scholar',
    role: 'MEMBER',
    avatarUrl: '',
    summary: '2nd grader, Sunday scripture memorizer, creative artist and praise dancer.',
    bio: `Faith is 7 years old and brings endless joy to our church family. She loves coloring bible story illustrations, reciting Psalm 100, and dancing with the Little Angels praise dance group.`,
    age: 7,
    dateOfBirth: '2019-08-22',
    relationshipTitle: 'Daughter (Pre-K / Primary)',
    childLock: {
      isLocked: true,
      lockedByParentId: 'mem_4',
      lockedByParentName: 'Lady Eleanor Vance',
      parentPin: '1234',
      hideFromDirectory: true,
      hideContactInfo: true,
      hidePhotos: true,
      ageThreshold: 13,
      lockedAt: 'Oct 2, 2026',
      note: 'Guardian Child Privacy Lock ACTIVE. Contact details and personal photo masked.'
    },
    email: 'faith.vance@familyvault.org',
    phone: '(312) 555-0143',
    privacy: {
      showEmail: false,
      showPhone: false,
      showGiving: false,
    },
    joinDate: 'September 2019',
    lastActive: 'Yesterday',
    householdId: 'hh_1',
    householdRole: 'Child',
    connectionStatus: 'connected',
    isFollowing: true,
    isOnline: false,
    volunteerBadges: [
      {
        id: 'vb_angels_dance',
        name: 'Little Angels Praise Dancer',
        category: 'Worship',
        tier: 'Bronze',
        hours: 15,
        iconName: 'Sparkles',
        description: 'Participated in Resurrection Sunday children praise dance performance.',
        earnedDate: '2024-03-31'
      }
    ],
    journeyMilestones: [
      {
        id: 'jm_9_1',
        title: 'Infant Dedication to the Lord',
        date: 'Oct 20, 2019',
        category: 'Baptism',
        description: 'Dedicated to the Lord at PLCC South Sanctuary.',
        officiatedBy: 'Pastor Marcus Vance'
      }
    ],
    attendanceStats: {
      totalServicesThisYear: 38,
      streakWeeks: 20,
      lastCheckedIn: 'Last Sunday, 10:30 AM',
      serviceType: 'Kingdom Kids Class Pre-K'
    },
    recentUpdates: []
  },
  {
    id: 'mem_10',
    username: 'noah.lewis',
    fullName: 'Noah Lewis',
    preferredName: 'Noah',
    title: 'Junior Usher & Middle School Youth',
    role: 'MEMBER',
    avatarUrl: '',
    summary: '6th grader, junior usher assistant and science enthusiast.',
    bio: `Noah is 11 years old. He assists with Sunday morning bulletin distribution alongside his dad Terrell and is preparing for water baptism in the youth group.`,
    age: 11,
    dateOfBirth: '2015-02-18',
    relationshipTitle: 'Son (Junior Youth)',
    childLock: {
      isLocked: false,
      lockedByParentId: 'mem_7',
      lockedByParentName: 'Brother Terrell Lewis',
      parentPin: '1234',
      hideFromDirectory: false,
      hideContactInfo: true,
      hidePhotos: false,
      ageThreshold: 13,
      lockedAt: 'Sept 20, 2026',
      note: 'Public directory enabled by parent.'
    },
    email: 'noah.lewis@familyconnect.com',
    phone: '(312) 555-3371',
    privacy: {
      showEmail: false,
      showPhone: false,
      showGiving: false,
    },
    joinDate: 'February 2024',
    lastActive: '1 hour ago',
    householdId: 'hh_5',
    householdRole: 'Child',
    connectionStatus: 'none',
    isFollowing: false,
    isOnline: true,
    volunteerBadges: [
      {
        id: 'vb_jr_usher',
        name: 'Junior Usher Assistant',
        category: 'Ushering',
        tier: 'Bronze',
        hours: 14,
        iconName: 'Shield',
        description: 'Assists senior ushers with Sunday bulletins and seating directions.',
        earnedDate: '2024-07-28'
      }
    ],
    journeyMilestones: [
      {
        id: 'jm_10_1',
        title: 'Joined PLCC with Household',
        date: 'Feb 18, 2024',
        category: 'Membership',
        description: 'Joined Promised Land Christian Center fellowship alongside father Terrell and brother Micah.',
        officiatedBy: 'Pastor Marcus Vance'
      }
    ],
    attendanceStats: {
      totalServicesThisYear: 26,
      streakWeeks: 6,
      lastCheckedIn: 'Last Sunday, 10:45 AM',
      serviceType: 'Middle School Sunday Discovery'
    },
    recentUpdates: []
  },
  {
    id: 'mem_11',
    username: 'micah.lewis',
    fullName: 'Micah Lewis',
    preferredName: 'Micah',
    title: 'Kingdom Kids Primary & Drum Explorer',
    role: 'MEMBER',
    avatarUrl: '',
    summary: '3rd grader, memorizing Proverbs and junior church drummer in training.',
    bio: `Micah is 8 years old. He loves beats and rhythms, learning drumming from Brother David in the music department, and memorizing Proverbs.`,
    age: 8,
    dateOfBirth: '2018-05-12',
    relationshipTitle: 'Younger Son',
    childLock: {
      isLocked: true,
      lockedByParentId: 'mem_7',
      lockedByParentName: 'Brother Terrell Lewis',
      parentPin: '1234',
      hideFromDirectory: true,
      hideContactInfo: true,
      hidePhotos: false,
      ageThreshold: 13,
      lockedAt: 'Sept 20, 2026',
      note: 'Protected based on age (Under 10). Guarded by parent Terrell Lewis.'
    },
    email: 'micah.lewis@familyconnect.com',
    phone: '(312) 555-3371',
    privacy: {
      showEmail: false,
      showPhone: false,
      showGiving: false,
    },
    joinDate: 'February 2024',
    lastActive: 'Yesterday',
    householdId: 'hh_5',
    householdRole: 'Child',
    connectionStatus: 'none',
    isFollowing: false,
    isOnline: false,
    volunteerBadges: [
      {
        id: 'vb_drums_jr',
        name: 'Junior Rhythm Apprentice',
        category: 'Worship',
        tier: 'Bronze',
        hours: 10,
        iconName: 'Music',
        description: 'Learning drum fundamentals and praise tempos.',
        earnedDate: '2024-08-14'
      }
    ],
    journeyMilestones: [
      {
        id: 'jm_11_1',
        title: 'Joined PLCC with Household',
        date: 'Feb 18, 2024',
        category: 'Membership',
        description: 'United with the PLCC congregation with the Lewis family.',
        officiatedBy: 'Pastor Marcus Vance'
      }
    ],
    attendanceStats: {
      totalServicesThisYear: 25,
      streakWeeks: 6,
      lastCheckedIn: 'Last Sunday, 10:45 AM',
      serviceType: 'Kingdom Kids Class Primary'
    },
    recentUpdates: []
  }
];

export const INITIAL_HOUSEHOLDS: Household[] = [
  {
    id: 'hh_1',
    name: 'The Vance Household',
    address: '4428 S Michigan Ave, Chicago, IL 60653',
    campus: 'Main Sanctuary - South Boulevard',
    memberIds: ['mem_1', 'mem_4', 'mem_8', 'mem_9'],
    headMemberId: 'mem_1',
    phone: '(312) 555-0142'
  },
  {
    id: 'hh_2',
    name: 'The Johnson Family',
    address: '1850 E 71st St, Chicago, IL 60649',
    campus: 'Main Sanctuary - South Boulevard',
    memberIds: ['mem_2', 'mem_6'],
    headMemberId: 'mem_2',
    phone: '(312) 555-0819'
  },
  {
    id: 'hh_3',
    name: 'The Okafor Household',
    address: '5210 S Harper Ave, Chicago, IL 60615',
    campus: 'Main Sanctuary - South Boulevard',
    memberIds: ['mem_3'],
    headMemberId: 'mem_3',
    phone: '(312) 555-4421'
  },
  {
    id: 'hh_4',
    name: 'The Washington Family',
    address: '8912 S Euclid Ave, Chicago, IL 60617',
    campus: 'Main Sanctuary - South Boulevard',
    memberIds: ['mem_5'],
    headMemberId: 'mem_5',
    phone: '(312) 555-7793'
  },
  {
    id: 'hh_5',
    name: 'The Lewis Family',
    address: '6145 S Cottage Grove Ave, Chicago, IL 60637',
    campus: 'Main Sanctuary - South Boulevard',
    memberIds: ['mem_7', 'mem_10', 'mem_11'],
    headMemberId: 'mem_7',
    phone: '(312) 555-3371'
  }
];

export const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: 'msg_1',
    senderId: 'mem_2',
    receiverId: 'mem_1',
    content: 'Good morning Pastor Marcus! The hospitality schedule for this Sunday is finalized. We have 8 greeters ready for both services.',
    timestamp: 'Today, 8:42 AM',
    read: true
  },
  {
    id: 'msg_2',
    senderId: 'mem_1',
    receiverId: 'mem_2',
    content: 'Praise God Sister Keisha! Thank you for your faithful leadership. Please make sure the welcome cards are stocked at the info booth.',
    timestamp: 'Today, 8:50 AM',
    read: true
  },
  {
    id: 'msg_3',
    senderId: 'mem_2',
    receiverId: 'mem_1',
    content: 'Already packed and placed on the welcome counter! Praying for an anointed Sunday.',
    timestamp: 'Today, 9:02 AM',
    read: true
  },
  {
    id: 'msg_4',
    senderId: 'mem_3',
    receiverId: 'mem_1',
    content: 'Pastor, the live stream test for the new digital soundboard went great last night. Latency is down to zero.',
    timestamp: 'Yesterday, 6:15 PM',
    read: true
  },
  {
    id: 'msg_5',
    senderId: 'mem_1',
    receiverId: 'mem_3',
    content: 'Wonderful news Brother David! God bless you and your team for keeping the standard of excellence high.',
    timestamp: 'Yesterday, 6:30 PM',
    read: true
  }
];

export const INITIAL_PRAYER_REQUESTS: PrayerRequest[] = [
  {
    id: 'pr_1',
    authorId: 'mem_2',
    authorName: 'Sister Keisha Johnson',
    authorAvatar: KEISHA_AVATAR,
    title: 'Healing for Aunt Evelyn\'s Knee Surgery',
    category: 'Healing & Health',
    description: 'Please keep my Aunt Evelyn in prayer as she undergoes orthopedic surgery this Thursday morning. Believing for smooth operation and rapid physical recovery!',
    timestamp: '4 hours ago',
    prayedCount: 34,
    hasPrayed: true,
    isUrgent: false,
    isAnonymous: false
  },
  {
    id: 'pr_2',
    authorId: 'mem_7',
    authorName: 'Brother Terrell Lewis',
    authorAvatar: '',
    title: 'New Job Offer & Relocation Guidance',
    category: 'Financial Provision',
    description: 'Asking the church family to stand in agreement for discernment regarding a potential promotion that would require new schedule adjustments for my sons.',
    timestamp: 'Yesterday at 2:20 PM',
    prayedCount: 26,
    hasPrayed: false,
    isUrgent: false,
    isAnonymous: false
  },
  {
    id: 'pr_3',
    authorId: 'mem_1',
    authorName: 'Pastor Marcus Vance',
    authorAvatar: PASTOR_AVATAR,
    title: 'Urgent: Complete Healing for Deaconess Clara in ICU',
    category: 'Healing & Health',
    description: 'Saints, let us unite our hearts immediately for Mother Clara currently in respiratory care. We speak peace, breath, and divine restoration over her body!',
    timestamp: '1 day ago',
    prayedCount: 92,
    hasPrayed: true,
    isUrgent: true,
    isAnonymous: false
  },
  {
    id: 'pr_4',
    authorId: 'mem_6',
    authorName: 'Sister Maya Sterling',
    authorAvatar: '',
    title: 'Praise Report: College Tuition Grant Received!',
    category: 'Praise Report',
    description: 'Glory to God! The grant for my final semester was fully approved this morning without debt! Thank you to everyone who prayed with me through this season.',
    timestamp: '2 days ago',
    prayedCount: 48,
    hasPrayed: true,
    isUrgent: false,
    isAnonymous: false
  }
];

export const INITIAL_NOTIFICATIONS: ChurchNotification[] = [
  {
    id: 'notif_1',
    title: '🚨 Urgent Prayer Alert',
    body: 'Pastor Marcus called for special prayer for Mother Clara. Join 92 prayer warriors now.',
    type: 'urgent_prayer',
    timestamp: '1 hour ago',
    read: false,
    urgent: true
  },
  {
    id: 'notif_2',
    title: '💬 New Direct Message',
    body: 'Sister Keisha Johnson sent you an update regarding Sunday Greeters schedule.',
    type: 'direct_message',
    timestamp: '3 hours ago',
    read: false,
    urgent: false
  },
  {
    id: 'notif_3',
    title: '🤝 Connection Request Accepted',
    body: 'Brother David Okafor accepted your community fellowship connection.',
    type: 'connection',
    timestamp: 'Yesterday',
    read: true,
    urgent: false
  },
  {
    id: 'notif_4',
    title: '📢 Worship Service Announcement',
    body: 'Upcoming Communion Sunday: Combined 10:30 AM Service with fellowship luncheon following.',
    type: 'service_alert',
    timestamp: '2 days ago',
    read: true,
    urgent: false
  }
];
