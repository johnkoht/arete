export type MeetingStatus = "Synced" | "Processed" | "Approved";
export type ItemStatus = "pending" | "approved" | "skipped";
export type ItemType = "action" | "decision" | "learning";

export interface Attendee {
  initials: string;
  name: string;
}

export interface ReviewItem {
  id: string;
  type: ItemType;
  text: string;
  status: ItemStatus;
}

export interface Meeting {
  slug: string;
  title: string;
  date: string; // ISO
  attendees: Attendee[];
  status: MeetingStatus;
  duration: number; // minutes
  source: string;
  summary?: string;
  transcript?: string;
  reviewItems?: ReviewItem[];
  keyPoints?: string[];
  rawActionItems?: string[];
}

export const MEETINGS: Meeting[] = [
  {
    slug: "q1-roadmap-review",
    title: "Q1 Roadmap Review",
    date: "2026-03-03T10:00:00Z",
    attendees: [
      { initials: "JK", name: "John Koht" },
      { initials: "SM", name: "Sarah Mitchell" },
      { initials: "AR", name: "Alex Rodriguez" },
    ],
    status: "Processed",
    duration: 62,
    source: "Krisp",
    summary:
      "The team reviewed the Q1 roadmap with a focus on enterprise positioning. Key decisions included prioritizing enterprise tier features before SMB expansion. The notifications feature was scoped to push-only for v1, with in-app banners deferred to Q2. Action items center around stakeholder communication and technical specifications.",
    transcript: `**John K** [00:00:12]\nAlright, let's get started. Today we're going through the Q1 roadmap and making sure we're aligned on priorities.\n\n**Sarah M** [00:00:25]\nSounds good. I think the biggest open question is whether we go enterprise-first or continue the SMB push.\n\n**Alex R** [00:00:48]\nFrom an engineering perspective, the enterprise features have more shared infrastructure with what we're already building.\n\n**John K** [00:01:15]\nThat's a good point. I've been hearing from sales that enterprise deals have longer cycles but higher ACV. Let's prioritize enterprise tier.\n\n**Sarah M** [00:02:14]\nAgreed. For notifications — can we scope it down? Full in-app banners plus push is a lot for one quarter.\n\n**John K** [00:02:45]\nLet's do push-only for v1. We can add in-app banners in Q2.\n\n**Alex R** [00:03:20]\nThat works. I'll draft the technical spec this week.\n\n**John K** [00:04:00]\nGreat. Sarah, can you share the updated roadmap deck with stakeholders by end of day Friday?\n\n**Sarah M** [00:04:15]\nWill do. I'll also set up a follow-up to review the pricing model.\n\n**John K** [00:04:45]\nPerfect. One more thing — I want us to review competitor pricing pages before the next sprint. Alex, can you take a look?\n\n**Alex R** [00:05:10]\nSure, I'll add it to my list.\n\n**John K** [00:05:30]\nAlright, I think we're good. Thanks everyone.`,
    reviewItems: [
      { id: "ai-1", type: "action", text: "Schedule follow-up with Sarah on pricing model by March 10", status: "pending" },
      { id: "ai-2", type: "action", text: "Share Q1 roadmap deck with stakeholders by EOD Friday", status: "approved" },
      { id: "ai-3", type: "action", text: "Draft technical spec for notifications feature", status: "pending" },
      { id: "ai-4", type: "action", text: "Review competitor pricing pages", status: "skipped" },
      { id: "d-1", type: "decision", text: "We will prioritize enterprise tier before SMB expansion in Q1", status: "pending" },
      { id: "d-2", type: "decision", text: "Notifications feature scoped to push-only for v1; in-app banners deferred", status: "approved" },
      { id: "l-1", type: "learning", text: "Enterprise customers care more about audit logs than we anticipated", status: "pending" },
      { id: "l-2", type: "learning", text: "Weekly stakeholder updates are preferred over bi-weekly", status: "pending" },
    ],
  },
  {
    slug: "1-1-with-lindsay",
    title: "1:1 with Lindsay",
    date: "2026-03-03T14:00:00Z",
    attendees: [
      { initials: "JK", name: "John Koht" },
      { initials: "LS", name: "Lindsay Scott" },
    ],
    status: "Synced",
    duration: 30,
    source: "Krisp",
    summary: "Discussed team morale and upcoming project timelines. Lindsay raised concerns about resource allocation for the enterprise push. Agreed to revisit headcount planning next week.",
    keyPoints: [
      "Team morale is generally positive but some concerns about workload",
      "Enterprise push may require additional headcount",
      "Lindsay to draft resource allocation proposal",
      "Revisit headcount planning in next 1:1",
    ],
    rawActionItems: [
      "Lindsay to draft resource allocation proposal by March 7",
      "John to review Q1 headcount budget",
      "Schedule follow-up on hiring timeline",
    ],
    transcript: `**John K** [00:00:05]\nHey Lindsay, how's everything going?\n\n**Lindsay S** [00:00:12]\nGood overall. The team is in a good place, but I'm a bit worried about bandwidth with the enterprise push.\n\n**John K** [00:00:35]\nYeah, that's fair. What are you thinking?\n\n**Lindsay S** [00:01:02]\nI think we need at least one more engineer. I'll draft a resource allocation proposal this week.\n\n**John K** [00:01:20]\nThat would be helpful. I'll review the Q1 headcount budget on my end.\n\n**Lindsay S** [00:01:45]\nSounds good. Let's revisit in our next 1:1.`,
  },
  {
    slug: "discovery-enterprise-pricing",
    title: "Discovery: Enterprise Pricing",
    date: "2026-03-02T09:00:00Z",
    attendees: [
      { initials: "JK", name: "John Koht" },
      { initials: "SM", name: "Sarah Mitchell" },
      { initials: "BC", name: "Bob Chen" },
      { initials: "CP", name: "Carol Park" },
    ],
    status: "Processed",
    duration: 47,
    source: "Krisp",
    summary: "Deep dive into enterprise pricing strategy. Reviewed competitor analysis and discussed tiered pricing models. The team leaned toward a usage-based model with a platform fee.",
    transcript: `**John K** [00:00:10]\nLet's dive into enterprise pricing. Bob, can you walk us through the competitor analysis?\n\n**Bob C** [00:00:25]\nSure. Most competitors use tiered pricing — basic, pro, enterprise. Enterprise is typically custom.\n\n**Carol P** [00:01:10]\nI think we should consider usage-based pricing. It aligns better with how enterprise customers think about value.\n\n**Sarah M** [00:01:45]\nAgreed, but we need a platform fee as a baseline. Pure usage-based can be unpredictable for us.\n\n**John K** [00:02:30]\nLet's go with usage-based plus platform fee. Bob, can you model out a few scenarios?`,
    reviewItems: [
      { id: "ep-ai-1", type: "action", text: "Bob to model three pricing scenarios by March 7", status: "pending" },
      { id: "ep-ai-2", type: "action", text: "Carol to survey 5 enterprise prospects on pricing preferences", status: "pending" },
      { id: "ep-d-1", type: "decision", text: "Adopt usage-based pricing with platform fee for enterprise tier", status: "pending" },
      { id: "ep-l-1", type: "learning", text: "Competitors mostly use tiered pricing; usage-based is a differentiator", status: "pending" },
    ],
  },
  {
    slug: "sprint-planning",
    title: "Sprint Planning",
    date: "2026-02-28T10:00:00Z",
    attendees: [
      { initials: "JK", name: "John Koht" },
      { initials: "AR", name: "Alex Rodriguez" },
      { initials: "TW", name: "Tom Wang" },
      { initials: "NP", name: "Nina Patel" },
    ],
    status: "Approved",
    duration: 90,
    source: "Krisp",
    summary: "Sprint 12 planning completed. Team committed to 34 story points. Focus areas: enterprise auth flow, notification service scaffolding, and API rate limiting improvements.",
    transcript: `**John K** [00:00:08]\nAlright team, let's plan Sprint 12.\n\n**Alex R** [00:00:20]\nI've groomed the backlog. We have about 50 points of ready stories.\n\n**Tom W** [00:00:45]\nI think we can commit to around 34 based on last sprint's velocity.\n\n**Nina P** [00:01:15]\nI'd like to pick up the notification service scaffolding. It's a prerequisite for the push notification feature.`,
    reviewItems: [
      { id: "sp-ai-1", type: "action", text: "Alex to set up CI pipeline for enterprise auth module", status: "approved" },
      { id: "sp-ai-2", type: "action", text: "Nina to scaffold notification service by end of sprint", status: "approved" },
      { id: "sp-ai-3", type: "action", text: "Tom to improve API rate limiting with sliding window", status: "approved" },
      { id: "sp-d-1", type: "decision", text: "Sprint 12 commitment: 34 story points", status: "approved" },
      { id: "sp-d-2", type: "decision", text: "Enterprise auth flow prioritized over SSO integration", status: "approved" },
      { id: "sp-l-1", type: "learning", text: "Team velocity stabilized around 32-36 points per sprint", status: "approved" },
    ],
  },
  {
    slug: "stakeholder-update",
    title: "Stakeholder Update",
    date: "2026-02-26T15:00:00Z",
    attendees: [
      { initials: "JK", name: "John Koht" },
      { initials: "LS", name: "Lindsay Scott" },
      { initials: "MT", name: "Mike Torres" },
    ],
    status: "Approved",
    duration: 35,
    source: "Krisp",
    summary: "Provided Q1 progress update to Mike. Enterprise features on track. Discussed timeline for public launch and marketing coordination.",
    transcript: `**John K** [00:00:05]\nMike, thanks for joining. Quick update on where we are with Q1.\n\n**Mike T** [00:00:15]\nGreat, I've been wanting to sync on timeline.\n\n**Lindsay S** [00:00:30]\nWe're on track for the enterprise features. Auth module is in progress, notifications scaffolding starts next sprint.`,
    reviewItems: [
      { id: "su-ai-1", type: "action", text: "John to send weekly status email to stakeholders", status: "approved" },
      { id: "su-d-1", type: "decision", text: "Public launch target: end of Q1", status: "approved" },
      { id: "su-l-1", type: "learning", text: "Stakeholders prefer concise weekly updates over detailed bi-weekly reports", status: "approved" },
    ],
  },
  {
    slug: "user-interview-notifications",
    title: "User Interview: Notifications",
    date: "2026-02-25T11:00:00Z",
    attendees: [
      { initials: "JK", name: "John Koht" },
      { initials: "ER", name: "Emily Reeves" },
    ],
    status: "Approved",
    duration: 28,
    source: "Krisp",
    summary: "Interviewed Emily about notification preferences. Users want granular control over notification types. Push notifications are the top priority; email digests are secondary.",
    transcript: `**John K** [00:00:10]\nEmily, thanks for taking the time. I'd love to hear about how you think about notifications.\n\n**Emily R** [00:00:25]\nSure! I get way too many notifications from tools. The ones I actually want are urgent items — like when someone assigns me something.\n\n**John K** [00:01:00]\nThat makes sense. Would you prefer push, email, or in-app?\n\n**Emily R** [00:01:20]\nPush for urgent things. Maybe a daily email digest for everything else.`,
    reviewItems: [
      { id: "ui-ai-1", type: "action", text: "Document notification preference patterns from user interviews", status: "approved" },
      { id: "ui-d-1", type: "decision", text: "Push notifications are highest priority for users", status: "approved" },
      { id: "ui-l-1", type: "learning", text: "Users want granular control — not just on/off for all notifications", status: "approved" },
      { id: "ui-l-2", type: "learning", text: "Email digests preferred as secondary channel, not primary", status: "approved" },
    ],
  },
];

export function getMeetingBySlug(slug: string): Meeting | undefined {
  return MEETINGS.find((m) => m.slug === slug);
}
