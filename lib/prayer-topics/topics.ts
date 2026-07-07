// Static topic catalog (ported from the Django prototype's PRAYER_TOPICS).
// Deliberately not a Prisma model — the content changes rarely and this
// avoids a third migration surface; promote to a real model only if in-app
// editing is ever needed.

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
