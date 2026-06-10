// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ApprovalPayloadRenderer, approvalLabel } from "./ApprovalPayload";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe("approvalLabel", () => {
  it("uses payload titles for generic board approvals", () => {
    expect(
      approvalLabel("request_board_approval", {
        title: "Reply with an ASCII frog",
      }),
    ).toBe("Board Approval: Reply with an ASCII frog");
  });
});

describe("ApprovalPayloadRenderer", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it("renders request_board_approval payload fields without falling back to raw JSON", () => {
    const root = createRoot(container);

    act(() => {
      root.render(
        <ApprovalPayloadRenderer
          type="request_board_approval"
          payload={{
            title: "Reply with an ASCII frog",
            summary: "Board asked for approval before posting the frog.",
            recommendedAction: "Approve the frog reply.",
            nextActionOnApproval: "Post the frog comment on the issue.",
            risks: ["The frog might be too powerful."],
            proposedComment: "(o)<",
          }}
        />,
      );
    });

    expect(container.textContent).toContain("Reply with an ASCII frog");
    expect(container.textContent).toContain("Board asked for approval before posting the frog.");
    expect(container.textContent).toContain("Approve the frog reply.");
    expect(container.textContent).toContain("Post the frog comment on the issue.");
    expect(container.textContent).toContain("The frog might be too powerful.");
    expect(container.textContent).toContain("(o)<");
    expect(container.textContent).not.toContain("\"recommendedAction\"");

    act(() => {
      root.unmount();
    });
  });

  it("can hide the repeated title when the card header already shows it", () => {
    const root = createRoot(container);

    act(() => {
      root.render(
        <ApprovalPayloadRenderer
          type="request_board_approval"
          hidePrimaryTitle
          payload={{
            title: "Reply with an ASCII frog",
            summary: "Board asked for approval before posting the frog.",
          }}
        />,
      );
    });

    expect(container.textContent).toContain("Board asked for approval before posting the frog.");
    expect(container.textContent).not.toContain("TitleReply with an ASCII frog");

    act(() => {
      root.unmount();
    });
  });

  it("renders HCC review links, content kind, image, checklist, and social plan", () => {
    const root = createRoot(container);

    act(() => {
      root.render(
        <ApprovalPayloadRenderer
          type="request_board_approval"
          payload={{
            title: "Infrastructure blog",
            reviewKind: "Blog article",
            contentFamily: "long-form article",
            department: "editorial",
            summary: "A full article package for approval.",
            fullDocumentUrl: "https://example.test/doc/blog-1",
            imageUrl: "https://example.test/img/blog-1",
            hccReviewUrl: "https://example.test/review/blog-1",
            socialDistributionRequired: true,
            sameImageForSocial: true,
            approvalChecklist: ["Open the full HTML document before approving."],
            socialDistributionPlan: ["Create LinkedIn and X posts using the same image."],
            seoGeoAeoValueSummary: "Build visibility for George Carrillo and HCC.",
            brandVisibilityTargets: ["George Carrillo", "Hispanic Construction Council"],
            seoKeywords: ["construction material costs"],
            geoEntities: ["Hispanic Construction Council"],
            aeoQuestions: ["How do tariffs affect Hispanic contractors?"],
            linkedinHashtags: ["#ConstructionCosts", "#HispanicContractors"],
            platforms: ["linkedin", "x", "bluesky", "facebook", "substack", "reddit"],
            publishingNotes: [
              "Substack: publish or repost the approved long-form article with the same approved image.",
              "Reddit: create an approved link or discussion post only in a subreddit whose rules allow the topic.",
            ],
          }}
        />,
      );
    });

    expect(container.textContent).toContain("Blog article");
    expect(container.textContent).toContain("long-form article");
    expect(container.textContent).toContain("Open full HTML");
    expect(container.textContent).toContain("Open image");
    expect(container.textContent).toContain("Social distribution required");
    expect(container.textContent).toContain("SEO / GEO / AEO impact");
    expect(container.textContent).toContain("Brand visibility targets");
    expect(container.textContent).toContain("George Carrillo");
    expect(container.textContent).toContain("construction material costs");
    expect(container.textContent).toContain("Hispanic Construction Council");
    expect(container.textContent).toContain("How do tariffs affect Hispanic contractors?");
    expect(container.textContent).toContain("#ConstructionCosts");
    expect(container.textContent).toContain("substack");
    expect(container.textContent).toContain("reddit");
    expect(container.textContent).toContain("Substack: publish or repost the approved long-form article");
    expect(container.textContent).toContain("Reddit: create an approved link or discussion post");
    expect(container.textContent).toContain("Open the full HTML document before approving.");
    expect(container.textContent).toContain("Create LinkedIn and X posts using the same image.");

    act(() => {
      root.unmount();
    });
  });

  it("renders quad social platform post copy inline", () => {
    const root = createRoot(container);

    act(() => {
      root.render(
        <ApprovalPayloadRenderer
          type="request_board_approval"
          payload={{
            title: "Morning social package",
            content_type: "quad-social-post",
            platforms: ["linkedin-ceo-personal", "x-hcc-build"],
            platform_copies: {
              linkedin: "LinkedIn post body with the complete copy.",
              x: "X post body.",
            },
          }}
        />,
      );
    });

    expect(container.textContent).toContain("Post copy");
    expect(container.textContent).toContain("linkedin");
    expect(container.textContent).toContain("LinkedIn post body with the complete copy.");
    expect(container.textContent).toContain("x");
    expect(container.textContent).toContain("X post body.");

    act(() => {
      root.unmount();
    });
  });

  it("normalizes stale HCC attachment links and suppresses unsigned review links", () => {
    const root = createRoot(container);

    act(() => {
      root.render(
        <ApprovalPayloadRenderer
          type="request_board_approval"
          payload={{
            title: "Infrastructure blog",
            fullDocumentUrl: "https://favoring-unruffled-brisket.ngrok-free.dev/doc/blog-1",
            imageUrl: "https://favoring-unruffled-brisket.ngrok-free.dev/img/blog-1",
            hccReviewUrl: "https://favoring-unruffled-brisket.ngrok-free.dev/review/blog-1",
          }}
        />,
      );
    });

    const links = Array.from(container.querySelectorAll("a")).map((link) => ({
      text: link.textContent ?? "",
      href: link.getAttribute("href"),
    }));
    expect(links).toEqual([
      expect.objectContaining({ text: expect.stringContaining("Open full HTML"), href: "/doc/blog-1" }),
      expect.objectContaining({ text: expect.stringContaining("Open image"), href: "/img/blog-1" }),
    ]);

    expect(container.textContent).not.toContain("Review page");

    act(() => {
      root.unmount();
    });
  });
});
