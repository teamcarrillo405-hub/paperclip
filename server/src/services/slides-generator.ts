import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
// pptxgenjs uses `export as namespace` which prevents standard InstanceType
// inference. We define a minimal structural interface for the instance and cast
// the runtime import to a compatible constructor at startup.
import _pptxDefault from "pptxgenjs";

interface IPptxSlide {
  addText(
    text: string | { text: string; options?: Record<string, unknown> }[],
    options?: Record<string, unknown>,
  ): void;
  addShape(type: string, options: Record<string, unknown>): void;
  addNotes(notes: string): void;
}

interface IPptxGen {
  layout: string;
  ShapeType: Record<string, string>;
  defineLayout(layout: { name: string; width: number; height: number }): void;
  addSlide(): IPptxSlide;
  writeFile(props: { fileName: string }): Promise<string>;
}

interface PptxConstructor {
  new (): IPptxGen;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const PptxGenJS = _pptxDefault as unknown as PptxConstructor;
type pptxgen = IPptxGen;
import { resolvePaperclipInstanceRoot } from "../home-paths.js";

export type SlideContent = {
  title: string;
  subtitle?: string;
  bullets?: string[];
  notes?: string;
  type: "title" | "content" | "section" | "blank";
};

export type PresentationRequest = {
  title: string;
  subtitle?: string;
  topic: string;
  slideCount?: number;
  docType:
    | "business-proposal"
    | "status-report"
    | "strategy"
    | "onboarding"
    | "general";
  companyName?: string;
  accentColor?: string;
};

export type PresentationResult = {
  id: string;
  title: string;
  filePath: string;
  slideCount: number;
  createdAt: string;
};

type PresentationIndex = PresentationResult[];

function presentationsDir(companyId: string): string {
  return path.resolve(
    resolvePaperclipInstanceRoot(),
    "data",
    "presentations",
    companyId,
  );
}

function indexPath(companyId: string): string {
  return path.join(presentationsDir(companyId), "index.json");
}

function readIndex(companyId: string): PresentationIndex {
  const p = indexPath(companyId);
  if (!fs.existsSync(p)) return [];
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8")) as PresentationIndex;
  } catch {
    return [];
  }
}

function writeIndex(companyId: string, index: PresentationIndex): void {
  fs.mkdirSync(presentationsDir(companyId), { recursive: true });
  fs.writeFileSync(indexPath(companyId), JSON.stringify(index, null, 2));
}

export function generateSlideOutline(
  request: PresentationRequest,
): SlideContent[] {
  const { title, subtitle, topic, docType, companyName } = request;
  const company = companyName ?? "Your Company";

  switch (docType) {
    case "business-proposal":
      return [
        {
          type: "title",
          title,
          subtitle: subtitle ?? `Proposal for ${company}`,
        },
        {
          type: "content",
          title: "Executive Summary",
          bullets: [
            `Overview of the proposed solution for ${topic}`,
            "Key benefits and expected outcomes",
            "Why this proposal addresses your needs",
            "Summary of investment and timeline",
          ],
        },
        {
          type: "content",
          title: "Problem Statement",
          bullets: [
            `Current challenges related to ${topic}`,
            "Pain points impacting operations",
            "Cost of inaction",
            "Opportunity for improvement",
          ],
        },
        {
          type: "content",
          title: "Proposed Solution",
          bullets: [
            `Tailored solution addressing ${topic}`,
            "Implementation approach and methodology",
            "Key deliverables",
            "How we differentiate from alternatives",
          ],
        },
        {
          type: "content",
          title: "Timeline",
          bullets: [
            "Phase 1: Discovery & Planning (Weeks 1-2)",
            "Phase 2: Development & Build (Weeks 3-6)",
            "Phase 3: Testing & Review (Weeks 7-8)",
            "Phase 4: Launch & Handoff (Week 9)",
          ],
        },
        {
          type: "content",
          title: "Investment",
          bullets: [
            "Itemized breakdown of costs",
            "Payment schedule and terms",
            "What is included in scope",
            "Optional add-ons available",
          ],
        },
        {
          type: "content",
          title: "ROI & Value",
          bullets: [
            `Expected return on investment for ${topic}`,
            "Measurable success metrics",
            "Payback period estimate",
            "Long-term strategic value",
          ],
        },
        {
          type: "content",
          title: "Next Steps",
          bullets: [
            "Review and sign proposal",
            "Schedule kickoff meeting",
            "Provide access and onboarding information",
            `Contact us to get started with ${topic}`,
          ],
        },
      ];

    case "status-report":
      return [
        {
          type: "title",
          title,
          subtitle: subtitle ?? `Status Update — ${topic}`,
        },
        {
          type: "content",
          title: "Summary",
          bullets: [
            `Current status of ${topic}: On Track`,
            "Reporting period: current sprint/quarter",
            "Overall health: Green",
            "No major escalations at this time",
          ],
        },
        {
          type: "content",
          title: "Accomplishments",
          bullets: [
            `Completed key milestones for ${topic}`,
            "Delivered features and improvements on schedule",
            "Team velocity maintained at target",
            "Stakeholder feedback incorporated",
          ],
        },
        {
          type: "content",
          title: "In Progress",
          bullets: [
            `Ongoing work on ${topic} phase 2`,
            "Integration testing underway",
            "Documentation updates in review",
            "Performance optimizations in progress",
          ],
        },
        {
          type: "content",
          title: "Blockers & Risks",
          bullets: [
            "No critical blockers at this time",
            "Dependency on third-party API response pending",
            "Resource constraint identified — mitigation in place",
            "Risk register updated",
          ],
        },
        {
          type: "content",
          title: "Metrics",
          bullets: [
            "Velocity: 42 story points (target: 40)",
            "Bug count: 3 open (down from 8)",
            "Test coverage: 78%",
            "Uptime: 99.9%",
          ],
        },
        {
          type: "content",
          title: "Next Period Goals",
          bullets: [
            `Complete ${topic} next milestone`,
            "Resolve outstanding blockers",
            "Improve test coverage to 85%",
            "Conduct retrospective and adjust plan",
          ],
        },
      ];

    case "strategy":
      return [
        {
          type: "title",
          title,
          subtitle: subtitle ?? `Strategic Plan — ${topic}`,
        },
        {
          type: "content",
          title: "Vision",
          bullets: [
            `To become the leading solution for ${topic}`,
            "Long-term aspirations for the organization",
            "Mission alignment and core values",
            "Where we want to be in 3-5 years",
          ],
        },
        {
          type: "content",
          title: "Market Analysis",
          bullets: [
            `Market size and growth trends for ${topic}`,
            "Competitive landscape overview",
            "Key opportunities identified",
            "Threats and mitigating strategies",
          ],
        },
        {
          type: "content",
          title: "Strategic Pillar 1: Growth",
          bullets: [
            "Expand into new market segments",
            `Leverage ${topic} for customer acquisition`,
            "Partnerships and channel development",
            "Target: 25% YoY revenue growth",
          ],
        },
        {
          type: "content",
          title: "Strategic Pillar 2: Innovation",
          bullets: [
            `Invest in R&D for ${topic} capabilities`,
            "Build proprietary technology advantages",
            "Foster a culture of experimentation",
            "Launch 2 new product lines this year",
          ],
        },
        {
          type: "content",
          title: "Strategic Pillar 3: Operational Excellence",
          bullets: [
            "Streamline core processes with automation",
            "Reduce operational costs by 15%",
            "Implement data-driven decision making",
            "Scale team with right talent and tools",
          ],
        },
        {
          type: "content",
          title: "Roadmap",
          bullets: [
            "Q1: Foundation — systems and team alignment",
            "Q2: Growth — execute on top priorities",
            "Q3: Scale — operationalize what's working",
            "Q4: Review — measure results and adjust",
          ],
        },
        {
          type: "content",
          title: "Success Metrics",
          bullets: [
            `KPI 1: Revenue growth tied to ${topic}`,
            "KPI 2: Customer satisfaction score > 90%",
            "KPI 3: Net Promoter Score > 50",
            "KPI 4: Employee engagement score",
          ],
        },
      ];

    case "onboarding":
      return [
        {
          type: "title",
          title,
          subtitle: subtitle ?? `Welcome to ${company}`,
        },
        {
          type: "content",
          title: "Welcome",
          bullets: [
            `Welcome to ${company} — we're thrilled to have you`,
            "This deck will help you get up to speed",
            "Don't hesitate to ask questions",
            "Your success is our success",
          ],
        },
        {
          type: "content",
          title: "Company Overview",
          bullets: [
            `${company} mission and values`,
            "Our history and milestones",
            "Products and services we offer",
            `Our work in ${topic}`,
          ],
        },
        {
          type: "content",
          title: "Your Role",
          bullets: [
            "Key responsibilities and expectations",
            "Who you report to and your team",
            "How your role ties to company goals",
            "Success metrics for your position",
          ],
        },
        {
          type: "content",
          title: "Tools & Systems",
          bullets: [
            "Core tools: Slack, Notion, GitHub",
            "Internal systems and access credentials",
            "Communication norms and meeting cadences",
            `Tools specific to ${topic}`,
          ],
        },
        {
          type: "content",
          title: "Meet the Team",
          bullets: [
            "Your direct team members",
            "Cross-functional partners",
            "Leadership team overview",
            "Key contacts for your first week",
          ],
        },
        {
          type: "content",
          title: "30-60-90 Day Plan",
          bullets: [
            "Days 1-30: Learn the landscape, shadow colleagues",
            "Days 31-60: Take ownership of first project",
            "Days 61-90: Deliver measurable impact",
            "Ongoing: Grow your skills and network",
          ],
        },
        {
          type: "content",
          title: "Resources",
          bullets: [
            "Employee handbook and HR portal",
            "Internal wiki and documentation",
            "Learning & development resources",
            "Who to contact for help",
          ],
        },
      ];

    case "general":
    default:
      return [
        {
          type: "title",
          title,
          subtitle: subtitle ?? topic,
        },
        {
          type: "content",
          title: "Overview",
          bullets: [
            `Introduction to ${topic}`,
            "Background and context",
            "Objectives of this presentation",
            "What to expect",
          ],
        },
        {
          type: "content",
          title: "Key Point 1",
          bullets: [
            `Primary insight about ${topic}`,
            "Supporting evidence and data",
            "Implications for the audience",
            "Action item",
          ],
        },
        {
          type: "content",
          title: "Key Point 2",
          bullets: [
            `Second key insight about ${topic}`,
            "Case study or example",
            "Lessons learned",
            "Recommended approach",
          ],
        },
        {
          type: "content",
          title: "Key Point 3",
          bullets: [
            `Third key insight about ${topic}`,
            "Quantitative or qualitative evidence",
            "Comparison with alternatives",
            "Best practices",
          ],
        },
        {
          type: "content",
          title: "Details",
          bullets: [
            `Deep dive on ${topic}`,
            "Technical or operational specifics",
            "Dependencies and requirements",
            "Timeline and milestones",
          ],
        },
        {
          type: "content",
          title: "Conclusion",
          bullets: [
            `Summary of ${topic}`,
            "Key takeaways for the audience",
            "Recommended next steps",
            "Questions and discussion",
          ],
        },
      ];
  }
}

export function buildPresentation(
  outline: SlideContent[],
  request: PresentationRequest,
): pptxgen {
  const accent = request.accentColor ?? "#F5C518";
  const company = request.companyName ?? "";
  const prs = new PptxGenJS();

  prs.layout = "LAYOUT_WIDE";
  prs.defineLayout({ name: "WIDE", width: 13.33, height: 7.5 });

  for (let i = 0; i < outline.length; i++) {
    const slide = outline[i];
    const pSlide = prs.addSlide();

    if (slide.type === "title") {
      // Title slide: accent bar at bottom, white text on dark background
      pSlide.addShape(prs.ShapeType.rect, {
        x: 0,
        y: 0,
        w: "100%",
        h: "100%",
        fill: { color: "1a1a2e" },
      });

      // Accent bar at bottom
      pSlide.addShape(prs.ShapeType.rect, {
        x: 0,
        y: 6.8,
        w: "100%",
        h: 0.7,
        fill: { color: accent.replace("#", "") },
      });

      // Title
      pSlide.addText(slide.title, {
        x: 0.8,
        y: 2.0,
        w: 11.7,
        h: 1.8,
        fontSize: 40,
        bold: true,
        color: "FFFFFF",
        align: "left",
        fontFace: "Calibri",
      });

      // Subtitle
      if (slide.subtitle) {
        pSlide.addText(slide.subtitle, {
          x: 0.8,
          y: 3.9,
          w: 10.0,
          h: 0.8,
          fontSize: 22,
          color: "CCCCCC",
          align: "left",
          fontFace: "Calibri",
        });
      }

      // Company name bottom-right
      if (company) {
        pSlide.addText(company, {
          x: 9.0,
          y: 6.85,
          w: 4.0,
          h: 0.5,
          fontSize: 12,
          color: "1a1a2e",
          bold: true,
          align: "right",
          fontFace: "Calibri",
        });
      }
    } else {
      // Content slide: white background
      pSlide.addShape(prs.ShapeType.rect, {
        x: 0,
        y: 0,
        w: "100%",
        h: "100%",
        fill: { color: "FFFFFF" },
      });

      // Accent bar at top
      pSlide.addShape(prs.ShapeType.rect, {
        x: 0,
        y: 0,
        w: "100%",
        h: 0.12,
        fill: { color: accent.replace("#", "") },
      });

      // Title
      pSlide.addText(slide.title, {
        x: 0.6,
        y: 0.2,
        w: 11.5,
        h: 0.9,
        fontSize: 28,
        bold: true,
        color: "1a1a2e",
        align: "left",
        fontFace: "Calibri",
      });

      // Divider line
      pSlide.addShape(prs.ShapeType.line, {
        x: 0.6,
        y: 1.15,
        w: 12.1,
        h: 0,
        line: { color: accent.replace("#", ""), width: 2 },
      });

      // Bullets
      if (slide.bullets && slide.bullets.length > 0) {
        const bulletObjs = slide.bullets.map((b) => ({
          text: b,
          options: {
            fontSize: 18,
            color: "333333",
            bullet: { type: "bullet" as const },
            breakLine: true,
          },
        }));

        pSlide.addText(bulletObjs, {
          x: 0.7,
          y: 1.3,
          w: 11.7,
          h: 5.6,
          fontFace: "Calibri",
          valign: "top",
        });
      }

      // Slide number bottom-right
      pSlide.addText(`${i}`, {
        x: 12.3,
        y: 7.0,
        w: 0.8,
        h: 0.35,
        fontSize: 11,
        color: "999999",
        align: "right",
        fontFace: "Calibri",
      });
    }

    // Speaker notes
    if (slide.notes) {
      pSlide.addNotes(slide.notes);
    }
  }

  return prs;
}

export async function generatePresentation(
  request: PresentationRequest,
  companyId: string,
): Promise<PresentationResult> {
  const id = randomUUID();
  const outline = generateSlideOutline(request);
  const prs = buildPresentation(outline, request);

  const dir = presentationsDir(companyId);
  fs.mkdirSync(dir, { recursive: true });

  const filePath = path.join(dir, `${id}.pptx`);
  await prs.writeFile({ fileName: filePath });

  const result: PresentationResult = {
    id,
    title: request.title,
    filePath,
    slideCount: outline.length,
    createdAt: new Date().toISOString(),
  };

  const index = readIndex(companyId);
  index.unshift(result);
  writeIndex(companyId, index);

  return result;
}

export function listPresentations(companyId: string): PresentationResult[] {
  return readIndex(companyId);
}

export function deletePresentation(companyId: string, id: string): void {
  const index = readIndex(companyId);
  const entry = index.find((r) => r.id === id);
  if (entry && fs.existsSync(entry.filePath)) {
    fs.unlinkSync(entry.filePath);
  }
  writeIndex(
    companyId,
    index.filter((r) => r.id !== id),
  );
}
