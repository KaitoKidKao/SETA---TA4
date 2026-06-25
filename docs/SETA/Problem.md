_SETA International Problem Statement_

_SETA International Agentic AI Hackathon 2026_ 01

# 4. Recruitment Screening & Shortlisting Agent

**Context:** TA/Recruiters handle multiple active JDs simultaneously, manually screening each CV
(read → compare against JD → evaluate → note in tracking sheet). Evaluation quality is
inconsistent; good candidates are easily missed due to fatigue or high CV volume, and
handwritten outreach messages are prone to errors (wrong name/company).

**Input:** A Job Description (JD) + a pool of candidate CVs.

**The agent must:**

1. Parse JD & extract screening criteria (tech stack, YOE, domain, English level)
2. Search & rank CVs by relevance to JD
3. Evaluate each CV with % fit score + explanation per criteria
4. Highlight candidate strengths & gaps
5. Draft shortlist summary report to (which is sent to Hiring Manager)
6. Draft personalized outreach messages (mentioning candidate's projects and past
    companies)

**Expected output:** Ranked shortlist with per-candidate fit report + ready-to-send personalized
outreach messages.

**Why agentic:** Requires structured evaluation with consistent criteria + personalized content
generation + multi-step reasoning (parse → match → score → explain → draft).

**Guardrails:**

- No auto-reject. Only rank low + flag for human review.
- TA must approve outreach before sending.
- Manual workload becomes unmanageable when CV volume spikes. Agents must scale
    without quality degradation.


