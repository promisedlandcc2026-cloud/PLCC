/**
 * Built-in starter devotionals for PLCC Connect's Daily page.
 * Used for any day Pastor or staff have not written one in the Vault, so Daily
 * is never empty. Verse text is not stored: Connect shows the exact KJV text for
 * `ref` from its bundled Bible.
 *
 * 26 weekday devotionals rotate Monday–Saturday; Sundays use the 4 worship ones.
 */
export type StarterDevotional = {
  title: string;
  ref: string;
  body: string;
  question: string;
  prayer: string;
};

export const STARTER_WEEKDAY: StarterDevotional[] = [
  {
    title: 'Joy Comes in the Morning',
    ref: 'Psalm 30:5',
    body:
      'David does not pretend the night is short, and he does not call weeping a failure of faith. He simply tells the truth about both halves of the sentence: the night is real — and it is not the end of the story. Joy is already on its way, scheduled for morning.\n\n' +
      'If you are in the middle of a night season, this verse is not asking you to feel joyful tonight. It is asking you to trust that God keeps appointments. The morning you cannot see yet is a morning He has already planned.',
    question: 'What is one thing you can hand to God tonight instead of carrying it into tomorrow?',
    prayer: 'Lord, I trust You with this night. I will rest in the promise that joy is coming with the morning. Amen.',
  },
  {
    title: 'Strength for Those Who Wait',
    ref: 'Isaiah 40:31',
    body:
      'Waiting is the one spiritual discipline nobody volunteers for. We would rather God hurry. But Isaiah says strength is not given to the hurried — it is renewed in those who wait, the way an eagle does not flap its way up the mountain but rides the wind it cannot see.\n\n' +
      'Waiting on the Lord is not doing nothing. It is staying close, staying hopeful, and refusing to grab a shortcut that costs you later. The strength comes in the waiting — not only after it.',
    question: 'Where has God asked you to wait, and what would it look like to wait hopefully instead of anxiously today?',
    prayer: 'Lord, waiting is hard for me. Renew my strength while I wait, and teach me to trust Your timing over my own. Amen.',
  },
  {
    title: 'Enough for Today',
    ref: 'Matthew 6:34',
    body:
      'Jesus is not telling us to be careless about the future. He is telling us to stop paying tomorrow’s bills with today’s peace. Most of what we rehearse in worry never happens — and the rehearsing itself steals the strength we actually need for the day in front of us.\n\n' +
      'God gave Israel manna one day at a time, and He still works that way. Grace for today is on today’s table. When tomorrow comes, its grace will be there too — served fresh, right on time.',
    question: 'Which worry about tomorrow can you name out loud to God right now, and then leave with Him for today?',
    prayer: 'Father, give me today my daily bread — including the peace I keep trying to borrow from tomorrow. Amen.',
  },
  {
    title: 'He Hears in the Morning',
    ref: 'Psalm 143:8',
    body:
      'David’s first request of the day is not for answers, resources, or rescue — it is to hear God’s lovingkindness. Before he knew which way to walk, he wanted to be sure of the heart of the One guiding him. Direction matters, but it comes second to being loved.\n\n' +
      'That is a pattern worth copying. Five quiet minutes hearing from God in the morning will steady your whole day more than an hour of anxious planning. Listen first. Then walk.',
    question: 'Before you check anything else today, sit with this verse for two minutes. What do you sense God saying about His love for you?',
    prayer: 'Lord, let the first voice I hear today be Yours. Show me the way I should walk, because my trust is in You. Amen.',
  },
  {
    title: 'This Is the Day',
    ref: 'Psalm 118:24',
    body:
      'This verse is easy to quote on good days. Its real power shows up on ordinary ones — the days that feel like leftovers from a long week. The psalmist’s declaration is a decision before it is a feeling: we will rejoice. Not because the day is perfect, but because the day is made by God, and He has never made a throwaway day.\n\n' +
      'Gratitude is how we agree with heaven about an ordinary day. Count three specific things before noon — a person, a provision, a small answered prayer — and watch an unremarkable day change its name.',
    question: 'Name three specific gifts from this week — one person, one provision, one moment — and thank God for each by name.',
    prayer: 'Lord, You made this day, and I choose to be glad in it. Open my eyes to the gifts I walked past this week. Amen.',
  },
  {
    title: 'Great Is Thy Faithfulness',
    ref: 'Lamentations 3:22-23',
    body:
      'Jeremiah wrote these words from the middle of ruins — not after the trouble had passed, but while he was still sitting in it. That is what makes this verse so honest. Faithfulness was not something he felt; it was something he remembered, on purpose, before his circumstances had changed at all.\n\n' +
      'Notice the rhythm he gives us: new every morning. God does not hand you a lifetime supply of mercy all at once. He gives it the way He gave manna in the wilderness — enough for today, waiting again tomorrow. You do not have to solve the whole week this morning. You only have to receive today’s mercy.',
    question: 'Before the day gets loud: what is one mercy — large or small — that was already waiting for you when you woke up today?',
    prayer: 'Lord, before I ask You for anything new, thank You for the mercy that met me this morning. Teach me to trust Your faithfulness one day at a time. Amen.',
  },
  {
    title: 'The Lord Is My Shepherd',
    ref: 'Psalm 23:1-3',
    body:
      'David knew sheep. He knew they do not lie down when they are hungry, afraid, or restless — a shepherd has to make it safe enough for them to rest. So when he writes “he maketh me to lie down,” he is describing a God who does the work of making rest possible.\n\n' +
      'You may be running on empty today. The Shepherd is not disappointed that you need green pastures; He planned them. Rest is not something you earn after the work is finished. It is something He leads you into.',
    question: 'Where in your life is the Shepherd inviting you to stop and rest instead of pushing harder?',
    prayer: 'Lord, You are my Shepherd. Lead me beside still waters today, and restore what this week has worn down in me. Amen.',
  },
  {
    title: 'Be Still and Know',
    ref: 'Psalm 46:10',
    body:
      'This psalm is set in a world of roaring waters, shaking mountains, and nations in uproar. In the middle of the noise, God does not say “fix it.” He says “be still, and know that I am God.” Stillness is not pretending the storm is gone. It is remembering who is still on the throne.\n\n' +
      'Try it for one minute today: set the phone down, breathe slowly, and repeat the verse until your heart catches up with your head. The situation may not change in that minute. You will.',
    question: 'What noise do you need to turn down today so you can hear that God is still God?',
    prayer: 'Lord, quiet the storm inside me. Help me to be still long enough to remember that You are God and I am not. Amen.',
  },
  {
    title: 'Cast Your Care',
    ref: '1 Peter 5:7',
    body:
      'Peter does not say “manage your care,” or “hide your care.” He says cast it — the way a fisherman throws a net with his whole body. Anxiety is not meant to be carried quietly until it breaks you. It is meant to be thrown, on purpose, onto Someone strong enough to hold it.\n\n' +
      'And the reason is simple: He cares for you. Not just for the problem — for you. You are not a burden to God when you bring Him what is heavy. You are His child.',
    question: 'What is the heaviest thing on your mind right now? Say it to God in one honest sentence.',
    prayer: 'Father, I give You what I have been carrying alone. Thank You that You care for me, not only for my situation. Amen.',
  },
  {
    title: 'Peace That Guards',
    ref: 'Philippians 4:6-7',
    body:
      'Paul wrote this from prison, which makes it hard to dismiss. He gives a simple exchange: bring everything to God in prayer, with thanksgiving — and God’s peace will stand guard over your heart and mind like a soldier at a gate.\n\n' +
      'Notice the thanksgiving part. Gratitude is not a reward for answered prayer; it is part of the prayer itself. When you thank God for what He has already done, worry loses some of its grip on what He has not done yet.',
    question: 'What can you thank God for right now, before your request is answered?',
    prayer: 'Lord, here are my requests — and here is my thanks. Guard my heart and mind with Your peace today. Amen.',
  },
  {
    title: 'A Lamp to My Feet',
    ref: 'Psalm 119:105',
    body:
      'A lamp in the ancient world did not light up the whole road. It lit the next step or two. That is often how God’s Word guides us: not a floodlight on the next ten years, but enough light for the next faithful step.\n\n' +
      'If you are waiting to see the whole path before you move, you may be waiting a long time. Open the Word, take the step it shows you, and trust that the light will move with you.',
    question: 'What is the next small, faithful step God’s Word is showing you this week?',
    prayer: 'Lord, light my next step. I don’t need to see the whole road — I just need to walk with You. Amen.',
  },
  {
    title: 'Trust With All Your Heart',
    ref: 'Proverbs 3:5-6',
    body:
      'Leaning on your own understanding is natural; it is how we get through most days. Solomon is not telling us to stop thinking. He is telling us not to put our full weight on our own thinking, the way you would not lean on a railing you were not sure would hold.\n\n' +
      'Trust is giving God the final word, especially where your understanding runs out. And the promise is that He will make your paths straight — not always easy, but straight, and going somewhere.',
    question: 'Where are you leaning hardest on your own understanding right now?',
    prayer: 'Lord, I choose to trust You with all my heart. Where I can’t see the way, direct my path. Amen.',
  },
  {
    title: 'Come Unto Me',
    ref: 'Matthew 11:28-30',
    body:
      'Jesus’ invitation is not to the strong or the put-together. It is to the weary and the heavy laden — the people most likely to think they are too tired to come. He offers rest, and then, surprisingly, a yoke.\n\n' +
      'A yoke was made for two. Jesus is not handing you a lighter load to carry alone; He is offering to walk under it with you. His yoke is easy because He is the one bearing the weight.',
    question: 'What would it look like to let Jesus carry the heavier side of what you are facing this week?',
    prayer: 'Jesus, I am weary, and I come to You. Teach me to walk in step with You and find rest for my soul. Amen.',
  },
  {
    title: 'Nothing Can Separate Us',
    ref: 'Romans 8:38-39',
    body:
      'Paul makes a list of everything that might come between us and God — death, life, angels, powers, things present, things to come — and then crosses every one of them off. Nothing in all creation can separate us from the love of God in Christ Jesus.\n\n' +
      'Your worst day cannot do it. Your biggest mistake cannot do it. Even your own doubts cannot do it. The love that holds you is not as fragile as your feelings about it.',
    question: 'What have you been afraid might separate you from God’s love? Bring it to Him today.',
    prayer: 'Lord, thank You that nothing can separate me from Your love. Help me to live today like I believe it. Amen.',
  },
  {
    title: 'Strength Made Perfect',
    ref: '2 Corinthians 12:9',
    body:
      'Paul asked three times for his weakness to be taken away. God’s answer was not “no” as much as “something better”: My grace is sufficient for thee. God chose to show His strength through Paul’s weakness instead of around it.\n\n' +
      'Your weak places are not disqualifications. They are often the very places where people see God most clearly in you. You do not have to hide them to be useful to Him.',
    question: 'What weakness have you been hiding that God might want to use for His glory?',
    prayer: 'Lord, Your grace is enough for me. Let Your strength be seen in the places where I am weakest. Amen.',
  },
  {
    title: 'Fear Not',
    ref: 'Isaiah 41:10',
    body:
      '“Fear not” is one of the most repeated commands in Scripture, and God never gives it without a reason. Here the reason is His presence: for I am with thee. Then three promises follow — I will strengthen thee, I will help thee, I will uphold thee.\n\n' +
      'Courage is not the absence of fear. It is remembering who is holding your hand while you walk through it.',
    question: 'What fear is loudest in your life today, and which of God’s three promises do you need most?',
    prayer: 'Lord, You are with me. Strengthen me, help me, and hold me up with Your righteous right hand today. Amen.',
  },
  {
    title: 'Love Is Patient',
    ref: '1 Corinthians 13:4-7',
    body:
      'Paul wrote this to a church full of arguments, not to a wedding. These words describe how love behaves when people are difficult: it is patient, it is kind, it keeps no record of wrongs. Love is less a feeling and more a way of treating people.\n\n' +
      'Read the list again and put Jesus’ name where the word “charity” is. It fits perfectly. Then ask Him to grow that same love in you — one patient, kind response at a time.',
    question: 'Who in your life needs patient, kind love from you this week?',
    prayer: 'Lord, You have loved me patiently. Help me to love the people around me the same way. Amen.',
  },
  {
    title: 'A Renewed Mind',
    ref: 'Romans 12:2',
    body:
      'Every day, the world is shaping how we think — through news, screens, and the conversations around us. Paul says we do not have to be pressed into that mold. We can be transformed, from the inside out, by the renewing of our minds.\n\n' +
      'Renewal happens through what we keep putting in front of our minds. A few minutes in God’s Word each day is not a small thing; it is how God slowly changes the way we see everything.',
    question: 'What is shaping your thinking most right now, and what would it look like to give God’s Word more room?',
    prayer: 'Lord, renew my mind today. Shape my thoughts by Your truth instead of by the world around me. Amen.',
  },
  {
    title: 'The Fruit of the Spirit',
    ref: 'Galatians 5:22-23',
    body:
      'Fruit is not manufactured; it grows. Paul does not hand us a to-do list of nine virtues to work harder at. He describes what the Holy Spirit grows in a life that stays connected to God.\n\n' +
      'Some of this fruit will be ripe in you, and some will still be green. That is normal. Growth takes seasons. Stay close to the Vine, and the fruit will come.',
    question: 'Which fruit of the Spirit do you most want God to grow in you this season?',
    prayer: 'Holy Spirit, grow Your fruit in me — love, joy, peace, patience, kindness, goodness, faithfulness, gentleness, and self-control. Amen.',
  },
  {
    title: 'Ask, Seek, Knock',
    ref: 'Matthew 7:7-8',
    body:
      'Jesus uses three verbs that keep going: keep asking, keep seeking, keep knocking. Prayer is not a single request dropped in a box. It is an ongoing conversation with a Father who wants to be asked.\n\n' +
      'Do not give up on the prayer you have prayed many times. Jesus promises that everyone who asks receives. The answer may look different than you expected, but you are not talking to a closed door.',
    question: 'What have you stopped praying about that God may want you to bring to Him again?',
    prayer: 'Father, I will keep asking, seeking, and knocking. Thank You that You hear me every time. Amen.',
  },
  {
    title: 'A New Creature',
    ref: '2 Corinthians 5:17',
    body:
      'In Christ, you are not just a better version of your old self. Paul says you are a new creation — the old has passed away. Your past is part of your story, but it is no longer your identity.\n\n' +
      'Some days you will not feel new. That is okay; this is a truth to stand on, not a feeling to wait for. God sees you as His new creation, and He is still at work.',
    question: 'What old label do you need to let go of because God has made you new?',
    prayer: 'Lord, thank You for making me new in Christ. Help me to live from who You say I am today. Amen.',
  },
  {
    title: 'All Things Work Together',
    ref: 'Romans 8:28',
    body:
      'Paul does not say all things are good. Some things are painful and wrong. He says that God works all things together for good for those who love Him — like a weaver bringing dark and bright threads into one pattern.\n\n' +
      'You may not see the pattern yet from where you are standing. That is the nature of being in the middle of it. Trust the Weaver with the threads you do not understand.',
    question: 'What hard thing in your life do you need to trust God to work together for good?',
    prayer: 'Lord, I don’t understand everything I’m walking through, but I trust that You are working it together for good. Amen.',
  },
  {
    title: 'Abide in the Vine',
    ref: 'John 15:5',
    body:
      'A branch does not strain to produce grapes. It simply stays connected to the vine, and life flows through it. Jesus says the same is true for us: apart from Him we can do nothing, but abiding in Him we bear much fruit.\n\n' +
      'Abiding is not complicated. It is staying close — in prayer, in His Word, in His church — on ordinary days as well as hard ones. Connection comes before fruit.',
    question: 'What helps you stay connected to Jesus during a busy week, and what pulls you away?',
    prayer: 'Jesus, You are the Vine and I am a branch. Keep me close to You, so that my life bears fruit for Your glory. Amen.',
  },
  {
    title: 'Do Not Grow Weary',
    ref: 'Galatians 6:9',
    body:
      'Doing good can be tiring, especially when nobody seems to notice and nothing seems to change. Paul knew that feeling. His encouragement is simple: keep going, because the harvest is coming in due season.\n\n' +
      'Farmers do not dig up seeds to check if they are growing. They keep watering and wait. Your prayers, your kindness, and your faithfulness are seeds. God has not forgotten them.',
    question: 'Where are you tempted to give up on doing good, and what would help you keep going?',
    prayer: 'Lord, when I am tired of doing good, renew my strength. I trust that in due season I will reap. Amen.',
  },
  {
    title: 'My Help Comes from the Lord',
    ref: 'Psalm 121:1-2',
    body:
      'Pilgrims sang this psalm on the road up to Jerusalem, looking at hills that could hide danger. Where does my help come from? Not from the hills, but from the Lord who made the hills.\n\n' +
      'When you look at what is in front of you this week and it feels too big, lift your eyes a little higher. The God who made heaven and earth is the God who is watching over you.',
    question: 'What “hill” is in front of you this week, and how does it look different when you remember who made it?',
    prayer: 'Lord, my help comes from You, the Maker of heaven and earth. Keep me today, coming in and going out. Amen.',
  },
  {
    title: 'In Everything Give Thanks',
    ref: '1 Thessalonians 5:16-18',
    body:
      'Rejoice evermore. Pray without ceasing. In every thing give thanks. Paul’s three short commands sound impossible until you notice he says “in” everything, not “for” everything. We do not have to thank God for every hard thing — but we can thank Him in the middle of it.\n\n' +
      'Thankfulness is a muscle. The more often we use it, the stronger it grows, until gratitude becomes the way we see the day.',
    question: 'What is one thing you can thank God for in the middle of a hard situation today?',
    prayer: 'Lord, teach me to rejoice, to pray, and to give thanks in everything — even here, even today. Amen.',
  },
];

export const STARTER_SUNDAY: StarterDevotional[] = [
  {
    title: 'Come, Let Us Worship',
    ref: 'Psalm 95:6-7',
    body:
      'Sunday is not a performance to watch — it is an invitation to answer. The psalmist’s call is plural on purpose: let us worship. Some weeks you arrive full of faith; other weeks you borrow the faith of the people singing beside you. That is not a weakness of gathered worship. That is the design.\n\n' +
      'Before service begins at 10:30, arrive with one expectation: that the Shepherd knows His sheep by name, and yours is one of them. Bring the week you actually had — He is not asking for a better one.',
    question: 'What are you bringing to God in worship today — a gratitude, a grief, or a question? Name it before you walk in.',
    prayer: 'Lord, we come to worship You together today. Meet Your people — meet me — exactly where we are. Amen.',
  },
  {
    title: 'Glad to Go to the House of the Lord',
    ref: 'Psalm 122:1',
    body:
      'David was glad when they said, “Let us go into the house of the Lord.” Notice that someone invited him. Worship is something we do together, and sometimes the gladness starts because a friend said, “Come with me.”\n\n' +
      'Today, come expecting to meet God with His people. And think of one person you could invite to come with you next Sunday.',
    question: 'Who is one person you could invite to worship with you next week?',
    prayer: 'Lord, thank You for Your house and Your people. Make me glad to worship You today, and give me courage to invite someone else. Amen.',
  },
  {
    title: 'Encourage One Another',
    ref: 'Hebrews 10:24-25',
    body:
      'The writer of Hebrews tells us not to give up meeting together. Why? Because we need each other to keep going — to be stirred up to love and good works, and to be encouraged when the week has been hard.\n\n' +
      'Your presence at church matters more than you know. Somebody needs your smile, your handshake, or your prayer today. At PLCC, everybody matters, and that includes you.',
    question: 'Who can you encourage at church today with a kind word or a prayer?',
    prayer: 'Lord, thank You for my church family. Use me today to encourage someone who needs it. Amen.',
  },
  {
    title: 'Where Two or Three Are Gathered',
    ref: 'Matthew 18:20',
    body:
      'Jesus promises His presence in a special way when His people gather in His name. That promise does not depend on the size of the room or how polished the service is. It depends on Him.\n\n' +
      'As you gather today — in the sanctuary, or watching online — remember that Jesus Himself is in the midst. Come ready to listen, to sing, and to be met.',
    question: 'What do you want to hear from Jesus as you gather with His people today?',
    prayer: 'Jesus, thank You for being in the midst of us when we gather. Speak to us and through us today. Amen.',
  },
];

const DAY_MS = 24 * 60 * 60 * 1000;

/** Starter devotional for a calendar day ("YYYY-MM-DD"). Same day → same devotional, everywhere. */
export function starterFor(day: string): StarterDevotional {
  const [y, m, d] = day.split('-').map(Number);
  const utc = Date.UTC(y, (m || 1) - 1, d || 1);
  const dow = new Date(utc).getUTCDay(); // 0 = Sunday
  const n = Math.floor(utc / DAY_MS);
  // Weeks start on Monday, so a Mon–Sun week always holds one run of the rotation.
  const fromMonday = (dow + 6) % 7;
  const week = Math.floor((n - fromMonday) / 7);
  if (dow === 0) return STARTER_SUNDAY[week % STARTER_SUNDAY.length];
  // Count only Monday–Saturday so the weekday set rotates without gaps.
  const weekdayIndex = week * 6 + fromMonday;
  return STARTER_WEEKDAY[weekdayIndex % STARTER_WEEKDAY.length];
}
