import type { KnowledgeBase } from "./types";

/**
 * Netherlands knowledge base.
 *
 * Figures are drawn from official sources (primarily Study in NL, the Dutch
 * government's official portal, plus the IND immigration service). Each record
 * carries its own provenance so the agent can cite it. These are reference
 * figures for guidance, not a substitute for each university's own admissions
 * and immigration pages, and the agent is instructed to say so.
 *
 * NOTE: figures change yearly. The `period` and `retrieved` fields make the
 * currency of each fact explicit; refresh them when the sources update.
 */

const STUDYINNL = "https://www.studyinnl.org";
const RETRIEVED = "2026-11-04";

export const netherlands: KnowledgeBase = {
  country: "NL",
  countryName: "Netherlands",
  currency: "EUR",

  scholarships: [
    {
      id: "nl-scholarship",
      name: "NL Scholarship (formerly Holland Scholarship)",
      provider: "government",
      summary:
        "A one-off grant from the Dutch Ministry of Education and participating universities for students from outside the European Economic Area (EEA).",
      value: "€5,000, paid once in the first year of study",
      coversFullTuition: false,
      eligibility: [
        "Nationality outside the EEA",
        "Applying for a full-time bachelor's or master's at a participating institution",
        "Not previously studied in the Netherlands",
      ],
      levels: ["bachelor", "master"],
      caveats: [
        "This is NOT a full scholarship: €5,000 is a one-time amount and does not renew.",
        "It does not cover tuition on its own; you still need to fund the rest of tuition and all living costs.",
        "You apply directly to the university, not to a paid agency. Application is free.",
      ],
      provenance: {
        source: "Study in NL - NL Scholarship",
        sourceUrl: `${STUDYINNL}/finances/nl-scholarship`,
        retrieved: RETRIEVED,
        period: "2026-2027",
      },
    },
    {
      id: "orange-knowledge",
      name: "Orange Knowledge Programme (ended)",
      provider: "government",
      summary:
        "A former Dutch government scholarship for professionals from eligible countries. It has ended and has no new application rounds.",
      value: "No longer available",
      coversFullTuition: false,
      eligibility: ["Not applicable - programme closed"],
      levels: ["master"],
      caveats: [
        "The Orange Knowledge Programme ended in 2024. There are no new rounds.",
        "If an agency offers to get you an 'Orange Knowledge' scholarship, that is a red flag - the programme is closed.",
      ],
      provenance: {
        source: "Study in NL - Scholarships",
        sourceUrl: `${STUDYINNL}/finances/scholarships`,
        retrieved: RETRIEVED,
      },
    },
    {
      id: "erasmus-mundus",
      name: "Erasmus Mundus Joint Masters",
      provider: "eu",
      summary:
        "EU-funded scholarships for selected joint master's programmes studied across multiple European countries, often including the Netherlands.",
      value:
        "Typically covers tuition plus a monthly living allowance and travel; amount varies by programme",
      coversFullTuition: true,
      eligibility: [
        "Admission to a specific Erasmus Mundus Joint Masters programme",
        "Selection is highly competitive and programme-specific",
      ],
      levels: ["master"],
      caveats: [
        "You apply to the specific joint programme, not to a general fund.",
        "Highly competitive; funding is limited and merit-based.",
      ],
      provenance: {
        source: "Study in NL - Scholarships (StudyFinder)",
        sourceUrl: `${STUDYINNL}/finances/scholarships`,
        retrieved: RETRIEVED,
      },
    },
  ],

  costs: [
    {
      id: "tuition-statutory",
      label: "Statutory tuition fee (government-set)",
      category: "tuition",
      amount: 2694,
      currency: "EUR",
      per: "year",
      notes:
        "The statutory fee applies mainly to EU/EEA students and some others who meet nationality and prior-study conditions. Most non-EEA students pay the higher institutional fee instead.",
      provenance: {
        source: "Study in NL - Tuition fees",
        sourceUrl: `${STUDYINNL}/finances/tuition-fees`,
        retrieved: RETRIEVED,
        period: "2026-2027",
      },
    },
    {
      id: "tuition-institutional",
      label: "Institutional tuition fee (non-EEA)",
      category: "tuition",
      amount: 11000,
      currency: "EUR",
      per: "year",
      rangeLow: 8000,
      rangeHigh: 20000,
      notes:
        "Non-EEA students typically pay an institutional fee set by each university. It varies widely by programme and level; bachelor's and master's differ, and technical/medical programmes sit at the top of the range. Always check the specific programme page for the exact figure.",
      provenance: {
        source: "Study in NL - Tuition fees",
        sourceUrl: `${STUDYINNL}/finances/tuition-fees`,
        retrieved: RETRIEVED,
        period: "2026-2027",
      },
    },
    {
      id: "living-costs",
      label: "Living costs",
      category: "living",
      amount: 1250,
      currency: "EUR",
      per: "month",
      rangeLow: 1000,
      rangeHigh: 1500,
      notes:
        "Covers rent, food, transport, insurance and personal expenses. Amsterdam and Utrecht sit at the higher end; smaller cities are cheaper. Budget for the higher end to be safe.",
      provenance: {
        source: "Study in NL - Costs of living",
        sourceUrl: `${STUDYINNL}/plan-your-stay`,
        retrieved: RETRIEVED,
      },
    },
    {
      id: "proof-of-funds",
      label: "Proof of funds required for the visa",
      category: "upfront",
      amount: 13569,
      currency: "EUR",
      per: "year",
      notes:
        "For the entry visa/residence permit, non-EU students must prove roughly €1,130 per month for 12 months (about €13,569), on top of any unpaid tuition. This money must be shown as available; it is not a fee paid to anyone.",
      provenance: {
        source: "Dutch immigration service (IND) - income requirements for study",
        sourceUrl: "https://ind.nl/en/income-requirements-study",
        retrieved: RETRIEVED,
        period: "2026",
      },
    },
    {
      id: "residence-permit-fee",
      label: "Residence permit / entry visa fee",
      category: "visa",
      amount: 286,
      currency: "EUR",
      per: "once",
      notes:
        "A non-refundable government fee for the residence permit, usually paid to and handled by your university as your sponsor. This is a government charge, not an agency service fee.",
      provenance: {
        source: "Dutch universities (IND-set fee)",
        sourceUrl: "https://ind.nl/en",
        retrieved: RETRIEVED,
        period: "2026",
      },
    },
    {
      id: "health-insurance",
      label: "Health insurance",
      category: "insurance",
      amount: 1400,
      currency: "EUR",
      per: "year",
      rangeLow: 150,
      rangeHigh: 1600,
      notes:
        "International students need valid health insurance. A student policy can be relatively cheap; if you work alongside study you may be required to switch to Dutch public insurance, which costs more.",
      provenance: {
        source: "Study in NL - Plan your stay (insurance)",
        sourceUrl: `${STUDYINNL}/plan-your-stay`,
        retrieved: RETRIEVED,
      },
    },
  ],

  institutions: [
    {
      id: "research-university",
      name: "Research universities (WO)",
      type: "research-university",
      summary:
        "Academically oriented universities focused on research-driven programmes. Suited to students aiming for academic or research careers.",
      provenance: {
        source: "Study in NL - Dutch education",
        sourceUrl: `${STUDYINNL}/dutch-education`,
        retrieved: RETRIEVED,
      },
    },
    {
      id: "applied-sciences",
      name: "Universities of applied sciences (HBO)",
      type: "university-of-applied-sciences",
      summary:
        "Practice-oriented institutions focused on professional preparation, often with internships. Suited to students wanting applied, career-focused study.",
      provenance: {
        source: "Study in NL - Dutch education",
        sourceUrl: `${STUDYINNL}/dutch-education`,
        retrieved: RETRIEVED,
      },
    },
  ],

  applications: [
    {
      id: "deadline-general",
      topic: "Application deadlines",
      detail:
        "Common deadlines are 15 January for numerus fixus (capped-intake) programmes and 1 May for most other programmes. Individual programmes, especially for non-EU applicants who need a visa, often set much earlier deadlines, so check each programme page.",
      provenance: {
        source: "Study in NL - How to apply",
        sourceUrl: `${STUDYINNL}/plan-your-stay/how-to-apply`,
        retrieved: RETRIEVED,
      },
    },
    {
      id: "english-requirement",
      topic: "English language requirement",
      detail:
        "English-taught programmes require proof of English proficiency, commonly IELTS or TOEFL. Typical minimums are around IELTS 6.0-6.5 for bachelor's and 6.5-7.0 for master's, but each programme sets its own exact score. Verify on the programme page.",
      provenance: {
        source: "Study in NL - How to apply",
        sourceUrl: `${STUDYINNL}/plan-your-stay/how-to-apply`,
        retrieved: RETRIEVED,
      },
    },
    {
      id: "numerus-fixus",
      topic: "Numerus fixus (capped programmes)",
      detail:
        "Some popular programmes limit the number of places (numerus fixus) and select among applicants. These have a fixed earlier deadline (15 January) and a selection procedure, so you cannot apply late.",
      provenance: {
        source: "Study in NL - How to apply",
        sourceUrl: `${STUDYINNL}/plan-your-stay/how-to-apply`,
        retrieved: RETRIEVED,
      },
    },
    {
      id: "how-to-find-programme",
      topic: "Finding an English-taught programme",
      detail:
        "The official Study in NL StudyFinder lists English-taught programmes across Dutch institutions. You search and apply directly; you do not need a paid agency to access it.",
      provenance: {
        source: "Study in NL - Find a study programme",
        sourceUrl: `${STUDYINNL}/dutch-education`,
        retrieved: RETRIEVED,
      },
    },
  ],

  visa: [
    {
      id: "who-needs-visa",
      topic: "Who needs a visa",
      detail:
        "EU/EEA nationals do not need a visa or work permit. Non-EU/EEA students generally need an entry visa (MVV) and/or a residence permit (VVR). Your university acts as your official sponsor and usually submits the immigration application for you.",
      provenance: {
        source: "Study in NL - Do you need a visa?",
        sourceUrl: `${STUDYINNL}/plan-your-stay/do-you-need-a-visa`,
        retrieved: RETRIEVED,
      },
    },
    {
      id: "sponsor-process",
      topic: "The university is your sponsor",
      detail:
        "For student immigration, the recognised sponsor is your university. They file the MVV/VVR application with the IND on your behalf. You do not need a private agency to lodge the immigration application, and no agency can 'guarantee' a visa.",
      provenance: {
        source: "Study in NL - Plan your stay",
        sourceUrl: `${STUDYINNL}/plan-your-stay`,
        retrieved: RETRIEVED,
      },
    },
    {
      id: "proof-of-funds-visa",
      topic: "Proof of funds for the visa",
      detail:
        "You must show about €1,130 per month for 12 months (roughly €13,569) as available funds, on top of unpaid tuition. This is money you must demonstrate you have; it is not paid to the university or an agent.",
      provenance: {
        source: "Dutch immigration service (IND) - income requirements for study",
        sourceUrl: "https://ind.nl/en/income-requirements-study",
        retrieved: RETRIEVED,
        period: "2026",
      },
    },
  ],

  redFlags: [
    {
      id: "guaranteed-admission",
      claim: "'We guarantee your admission / visa.'",
      why: "No one can guarantee admission or a visa. Admission is decided by the university and immigration by the IND. A guarantee is a sales tactic, not a fact.",
      reality:
        "A legitimate adviser improves your application and explains your realistic chances. The university decides admission; the IND decides the visa.",
    },
    {
      id: "pay-for-scholarship",
      claim: "'Pay us and we'll secure you a scholarship.'",
      why: "Official scholarships like the NL Scholarship are applied for directly through the university, for free. You cannot buy your way into them.",
      reality:
        "You apply for the NL Scholarship (€5,000, one-off) and other funding yourself through the university at no charge.",
      provenance: {
        source: "Study in NL - NL Scholarship",
        sourceUrl: `${STUDYINNL}/finances/nl-scholarship`,
        retrieved: RETRIEVED,
      },
    },
    {
      id: "hidden-total-cost",
      claim: "'Study in the Netherlands for almost nothing.'",
      why: "This hides the real total cost: institutional tuition for non-EEA students plus €1,000-1,500/month living costs, insurance, and proof of funds of about €13,569.",
      reality:
        "Budget honestly for tuition + about €12,000-18,000/year in living and related costs. Ask for a full written cost breakdown.",
      provenance: {
        source: "Study in NL - Finances",
        sourceUrl: `${STUDYINNL}/finances`,
        retrieved: RETRIEVED,
      },
    },
    {
      id: "fake-orange-knowledge",
      claim: "'We can get you the Orange Knowledge scholarship.'",
      why: "The Orange Knowledge Programme ended in 2024 and has no new rounds. Offering it is a sign the adviser is out of date or dishonest.",
      reality:
        "Look at currently open funding via the official StudyFinder instead.",
      provenance: {
        source: "Study in NL - Scholarships",
        sourceUrl: `${STUDYINNL}/finances/scholarships`,
        retrieved: RETRIEVED,
      },
    },
    {
      id: "withholding-documents",
      claim: "'Let us hold your original documents / passport for safekeeping.'",
      why: "Keeping your originals creates leverage to extract more fees and is a known abusive tactic.",
      reality:
        "You keep your own originals. You submit certified copies or upload scans yourself through official portals.",
    },
    {
      id: "upfront-large-fees",
      claim: "'Pay a large all-inclusive package fee upfront.'",
      why: "Large non-itemised upfront fees obscure what you are actually paying for and are hard to recover if the agency underdelivers.",
      reality:
        "Ask for an itemised list of services and fees. Most official steps (applying to programmes, the NL Scholarship, the StudyFinder) are free to access directly.",
    },
  ],
};
