// Static topic catalog (ported from the Django prototype's PRAYER_TOPICS,
// expanded to 10 curated verses per topic). Deliberately not a Prisma model —
// this is the reviewed, always-available core. AI-suggested additions beyond
// it live in the main DB's TopicVerse table (see
// app/api/topics/[slug]/more-verses) so they can be pulled without repeat AI
// calls and never overlap these references.

export type PrayerTopic = {
  slug: string;
  title: string;
  description: string;
  verses: Array<{ reference: string; text: string }>;
};

export const PRAYER_TOPICS: PrayerTopic[] = [
  {
    slug: "strength-and-courage",
    title: "Strength and Courage",
    description: "For facing fear, weakness, or a daunting road ahead.",
    verses: [
      {
        reference: "Joshua 1:9",
        text: "Be strong and courageous. Do not be afraid; do not be discouraged, for the LORD your God will be with you wherever you go."
      },
      {
        reference: "Isaiah 41:10",
        text: "So do not fear, for I am with you; do not be dismayed, for I am your God. I will strengthen you and help you; I will uphold you with my righteous right hand."
      },
      {
        reference: "Philippians 4:13",
        text: "I can do all this through him who gives me strength."
      },
      {
        reference: "Deuteronomy 31:6",
        text: "Be strong and courageous. Do not be afraid or terrified because of them, for the LORD your God goes with you; he will never leave you nor forsake you."
      },
      {
        reference: "Psalm 27:1",
        text: "The LORD is my light and my salvation—whom shall I fear? The LORD is the stronghold of my life—of whom shall I be afraid?"
      },
      {
        reference: "Psalm 46:1",
        text: "God is our refuge and strength, an ever-present help in trouble."
      },
      {
        reference: "Isaiah 40:31",
        text: "But those who hope in the LORD will renew their strength. They will soar on wings like eagles; they will run and not grow weary, they will walk and not be faint."
      },
      {
        reference: "2 Timothy 1:7",
        text: "For the Spirit God gave us does not make us timid, but gives us power, love and self-discipline."
      },
      {
        reference: "Ephesians 6:10",
        text: "Finally, be strong in the Lord and in his mighty power."
      },
      {
        reference: "1 Corinthians 16:13",
        text: "Be on your guard; stand firm in the faith; be courageous; be strong."
      }
    ]
  },
  {
    slug: "healing-and-health",
    title: "Healing and Health",
    description: "For sickness, recovery, and the restoration of body and soul.",
    verses: [
      {
        reference: "Jeremiah 30:17",
        text: "But I will restore you to health and heal your wounds, declares the LORD."
      },
      {
        reference: "James 5:14-15",
        text: "Is anyone among you sick? Let them call the elders of the church to pray over them and anoint them with oil in the name of the Lord. And the prayer offered in faith will make the sick person well; the Lord will raise them up."
      },
      {
        reference: "Psalm 103:2-3",
        text: "Praise the LORD, my soul, and forget not all his benefits—who forgives all your sins and heals all your diseases."
      },
      {
        reference: "Psalm 147:3",
        text: "He heals the brokenhearted and binds up their wounds."
      },
      {
        reference: "Isaiah 53:5",
        text: "But he was pierced for our transgressions, he was crushed for our iniquities; the punishment that brought us peace was on him, and by his wounds we are healed."
      },
      {
        reference: "Psalm 30:2",
        text: "LORD my God, I called to you for help, and you healed me."
      },
      {
        reference: "3 John 1:2",
        text: "Dear friend, I pray that you may enjoy good health and that all may go well with you, even as your soul is getting along well."
      },
      {
        reference: "Proverbs 17:22",
        text: "A cheerful heart is good medicine, but a crushed spirit dries up the bones."
      },
      {
        reference: "Matthew 11:28",
        text: "Come to me, all you who are weary and burdened, and I will give you rest."
      },
      {
        reference: "Exodus 15:26",
        text: "He said, \"If you listen carefully to the LORD your God and do what is right in his eyes... I am the LORD, who heals you.\""
      }
    ]
  },
  {
    slug: "guidance-and-direction",
    title: "Guidance and Direction",
    description: "For decisions, crossroads, and trusting God with the path.",
    verses: [
      {
        reference: "Proverbs 3:5-6",
        text: "Trust in the LORD with all your heart and lean not on your own understanding; in all your ways submit to him, and he will make your paths straight."
      },
      {
        reference: "Psalm 32:8",
        text: "I will instruct you and teach you in the way you should go; I will counsel you with my loving eye on you."
      },
      {
        reference: "John 16:13",
        text: "But when he, the Spirit of truth, comes, he will guide you into all the truth."
      },
      {
        reference: "Psalm 119:105",
        text: "Your word is a lamp for my feet, a light on my path."
      },
      {
        reference: "Isaiah 30:21",
        text: "Whether you turn to the right or to the left, your ears will hear a voice behind you, saying, \"This is the way; walk in it.\""
      },
      {
        reference: "Proverbs 16:9",
        text: "In their hearts humans plan their course, but the LORD establishes their steps."
      },
      {
        reference: "Jeremiah 29:11",
        text: "\"For I know the plans I have for you,\" declares the LORD, \"plans to prosper you and not to harm you, plans to give you hope and a future.\""
      },
      {
        reference: "Psalm 25:4-5",
        text: "Show me your ways, LORD, teach me your paths. Guide me in your truth and teach me, for you are God my Savior, and my hope is in you all day long."
      },
      {
        reference: "Psalm 23:3",
        text: "He refreshes my soul. He guides me along the right paths for his name's sake."
      },
      {
        reference: "Psalm 37:23",
        text: "The LORD makes firm the steps of the one who delights in him."
      }
    ]
  },
  {
    slug: "gratitude-and-thanksgiving",
    title: "Gratitude and Thanksgiving",
    description: "For counting blessings and giving thanks in every season.",
    verses: [
      {
        reference: "1 Thessalonians 5:16-18",
        text: "Rejoice always, pray continually, give thanks in all circumstances; for this is God's will for you in Christ Jesus."
      },
      {
        reference: "Psalm 107:1",
        text: "Give thanks to the LORD, for he is good; his love endures forever."
      },
      {
        reference: "Colossians 3:17",
        text: "And whatever you do, whether in word or deed, do it all in the name of the Lord Jesus, giving thanks to God the Father through him."
      },
      {
        reference: "Psalm 100:4",
        text: "Enter his gates with thanksgiving and his courts with praise; give thanks to him and praise his name."
      },
      {
        reference: "Psalm 136:1",
        text: "Give thanks to the LORD, for he is good. His love endures forever."
      },
      {
        reference: "Psalm 95:2",
        text: "Let us come before him with thanksgiving and extol him with music and song."
      },
      {
        reference: "Colossians 3:15",
        text: "Let the peace of Christ rule in your hearts, since as members of one body you were called to peace. And be thankful."
      },
      {
        reference: "James 1:17",
        text: "Every good and perfect gift is from above, coming down from the Father of the heavenly lights, who does not change like shifting shadows."
      },
      {
        reference: "Psalm 9:1",
        text: "I will give thanks to you, LORD, with all my heart; I will tell of all your wonderful deeds."
      },
      {
        reference: "2 Corinthians 9:15",
        text: "Thanks be to God for his indescribable gift!"
      }
    ]
  },
  {
    slug: "peace-and-comfort",
    title: "Peace and Comfort",
    description: "For anxious hearts, grief, and troubled nights.",
    verses: [
      {
        reference: "John 14:27",
        text: "Peace I leave with you; my peace I give you. I do not give to you as the world gives. Do not let your hearts be troubled and do not be afraid."
      },
      {
        reference: "Philippians 4:6-7",
        text: "Do not be anxious about anything, but in every situation, by prayer and petition, with thanksgiving, present your requests to God. And the peace of God, which transcends all understanding, will guard your hearts and your minds in Christ Jesus."
      },
      {
        reference: "Psalm 34:18",
        text: "The LORD is close to the brokenhearted and saves those who are crushed in spirit."
      },
      {
        reference: "Isaiah 26:3",
        text: "You will keep in perfect peace those whose minds are steadfast, because they trust in you."
      },
      {
        reference: "Matthew 5:4",
        text: "Blessed are those who mourn, for they will be comforted."
      },
      {
        reference: "2 Corinthians 1:3-4",
        text: "Praise be to the God and Father of our Lord Jesus Christ, the Father of compassion and the God of all comfort, who comforts us in all our troubles, so that we can comfort those in any trouble with the comfort we ourselves receive from God."
      },
      {
        reference: "Psalm 4:8",
        text: "In peace I will lie down and sleep, for you alone, LORD, make me dwell in safety."
      },
      {
        reference: "John 16:33",
        text: "I have told you these things, so that in me you may have peace. In this world you will have trouble. But take heart! I have overcome the world."
      },
      {
        reference: "Psalm 23:4",
        text: "Even though I walk through the darkest valley, I will fear no evil, for you are with me; your rod and your staff, they comfort me."
      },
      {
        reference: "1 Peter 5:7",
        text: "Cast all your anxiety on him because he cares for you."
      }
    ]
  },
  {
    slug: "wisdom-and-knowledge",
    title: "Wisdom and Knowledge",
    description: "For discernment, study, and understanding God's will.",
    verses: [
      {
        reference: "James 1:5",
        text: "If any of you lacks wisdom, you should ask God, who gives generously to all without finding fault, and it will be given to you."
      },
      {
        reference: "Proverbs 2:6",
        text: "For the LORD gives wisdom; from his mouth come knowledge and understanding."
      },
      {
        reference: "Colossians 1:9-10",
        text: "We continually ask God to fill you with the knowledge of his will through all the wisdom and understanding that the Spirit gives."
      },
      {
        reference: "Proverbs 1:7",
        text: "The fear of the LORD is the beginning of knowledge, but fools despise wisdom and instruction."
      },
      {
        reference: "Proverbs 9:10",
        text: "The fear of the LORD is the beginning of wisdom, and knowledge of the Holy One is understanding."
      },
      {
        reference: "James 3:17",
        text: "But the wisdom that comes from heaven is first of all pure; then peace-loving, considerate, submissive, full of mercy and good fruit, impartial and sincere."
      },
      {
        reference: "Proverbs 4:7",
        text: "The beginning of wisdom is this: Get wisdom. Though it cost all you have, get understanding."
      },
      {
        reference: "Psalm 90:12",
        text: "Teach us to number our days, that we may gain a heart of wisdom."
      },
      {
        reference: "Proverbs 3:7",
        text: "Do not be wise in your own eyes; fear the LORD and shun evil."
      },
      {
        reference: "1 Corinthians 1:25",
        text: "For the foolishness of God is wiser than human wisdom, and the weakness of God is stronger than human strength."
      }
    ]
  },
  {
    slug: "family-and-relationships",
    title: "Family and Relationships",
    description: "For marriages, children, friendships, and reconciliation.",
    verses: [
      {
        reference: "Ephesians 4:2-3",
        text: "Be completely humble and gentle; be patient, bearing with one another in love. Make every effort to keep the unity of the Spirit through the bond of peace."
      },
      {
        reference: "Colossians 3:13-14",
        text: "Bear with each other and forgive one another if any of you has a grievance against someone. Forgive as the Lord forgave you. And over all these virtues put on love, which binds them all together in perfect unity."
      },
      {
        reference: "1 Peter 4:8",
        text: "Above all, love each other deeply, because love covers over a multitude of sins."
      },
      {
        reference: "1 Corinthians 13:4",
        text: "Love is patient, love is kind. It does not envy, it does not boast, it is not proud."
      },
      {
        reference: "Proverbs 17:17",
        text: "A friend loves at all times, and a brother is born for a time of adversity."
      },
      {
        reference: "Ecclesiastes 4:9-10",
        text: "Two are better than one, because they have a good return for their labor: If either of them falls down, one can help the other up."
      },
      {
        reference: "John 13:34",
        text: "A new command I give you: Love one another. As I have loved you, so you must love one another."
      },
      {
        reference: "Romans 12:10",
        text: "Be devoted to one another in love. Honor one another above yourselves."
      },
      {
        reference: "1 John 4:19",
        text: "We love because he first loved us."
      },
      {
        reference: "Joshua 24:15",
        text: "But as for me and my household, we will serve the LORD."
      }
    ]
  }
];

export function listTopics(): PrayerTopic[] {
  return PRAYER_TOPICS;
}

export function getTopicBySlug(slug: string): PrayerTopic | undefined {
  return PRAYER_TOPICS.find((topic) => topic.slug === slug);
}

// Shared normalization for overlap checks between the static catalog, the
// TopicVerse table, and AI suggestions ("Psalm 23:1–2." == "psalm 23:1-2").
export function normalizeReference(reference: string): string {
  return reference
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/[.]+$/, "")
    .trim();
}
