// Five deliberate flaws seeded in INITIAL_DRAFT for critique precision scoring.
export const KNOWN_FLAWS: readonly string[] = [
  'High-risk classification claim has no source citation (Annex III / Article 6 required)',
  'Transparency claim overstated: "all AI systems... must disclose" — Article 52 applies to specific categories only, not all AI systems',
  'Section 4 description is inaccurate: it covers safe AI development broadly; the dual-use foundation model testing mandate is in Section 4.2 specifically',
  'The 6% penalty figure has no source citation (EU AI Act Article 99)',
  'Inconsistent terminology: "AI algorithms" and "automated systems" used interchangeably with "AI systems"; the Act defines "AI system" precisely and does not use "algorithm" as a regulatory term',
];

export const INITIAL_DRAFT = `# AI Governance: Key Challenges and Policy Responses

## Introduction

Artificial intelligence systems have become increasingly powerful, and governments
worldwide are responding with regulation. The EU AI Act and US Executive Order on AI
represent the two most significant regulatory frameworks currently in force.

## High-Risk Classification

The EU AI Act establishes a risk-based approach to AI regulation. High-risk AI systems
include those deployed in critical infrastructure, education, employment, and law
enforcement. These systems require conformity assessments and technical documentation
before they can be placed on the market.

## Transparency Requirements

All AI systems deployed to interact with humans must disclose their AI nature to users.
This applies to chatbots, recommendation systems, and automated decision-making tools
across all sectors. The requirement is absolute and applies regardless of risk level.

## US Executive Order Provisions

The US Executive Order on AI, signed in October 2023, requires federal agencies to
adopt AI governance policies. Section 4 of the Order mandates comprehensive safety
testing for all federal AI deployments, including a requirement that agencies report
their AI use cases to the Office of Management and Budget annually.

## Penalties and Enforcement

Both frameworks impose significant penalties for non-compliance. Violations involving
prohibited AI practices can result in fines of up to 6% of global annual turnover
under the EU framework. US federal agencies face budget restrictions and mandatory
corrective action plans for serious violations.

## Conclusion

The convergence of AI algorithms and traditional automated systems presents ongoing
definitional challenges for regulators. As AI systems become more capable, both the
EU and US frameworks will require continuous updates to remain effective.
`;
