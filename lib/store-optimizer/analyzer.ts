/**
 * Store Configuration Optimizer
 *
 * Analyzes incident data from agent conversations to generate
 * store reconfiguration recommendations for loss prevention.
 *
 * Uses Gemini for intelligent analysis and recommendation generation.
 */

import { readFileSync, writeFileSync } from "fs";
import path from "path";
import { getConversationDatabase } from "@/lib/agents/conversation-db";
import { getGeminiClient, isGeminiConfigured } from "@/lib/gemini/client";

const CONFIG_PATH = path.join(process.cwd(), "data", "store-configuration.md");

export interface IncidentSummary {
  location: string;
  cameraId: string;
  verdict: string;
  confidence: number;
  audioFindings: string[];
  visualFindings: string[];
  timestamp: Date;
}

export interface ZoneAnalysis {
  zoneId: string;
  zoneName: string;
  incidentCount: number;
  confirmedThreats: number;
  falsePositives: number;
  commonPatterns: string[];
  riskScore: number;
}

export interface StoreRecommendation {
  priority: "critical" | "high" | "medium" | "low";
  category: "camera" | "staffing" | "layout" | "signage" | "technology" | "training";
  location: string;
  recommendation: string;
  rationale: string;
  estimatedImpact: string;
}

export interface AnalysisReport {
  generatedAt: Date;
  incidentsAnalyzed: number;
  timeRange: { start: Date; end: Date };
  zoneAnalysis: ZoneAnalysis[];
  recommendations: StoreRecommendation[];
  summary: string;
  confidenceScore: number;
}

export class StoreOptimizer {
  private db: ReturnType<typeof getConversationDatabase>;

  constructor() {
    this.db = getConversationDatabase();
  }

  async analyze(): Promise<AnalysisReport> {
    // Gather incident data
    const incidents = this.gatherIncidentData();

    if (incidents.length === 0) {
      return this.emptyReport();
    }

    // Analyze by zone
    const zoneAnalysis = this.analyzeByZone(incidents);

    // Generate recommendations
    const recommendations = await this.generateRecommendations(
      incidents,
      zoneAnalysis
    );

    // Create report
    const report: AnalysisReport = {
      generatedAt: new Date(),
      incidentsAnalyzed: incidents.length,
      timeRange: {
        start: new Date(
          Math.min(...incidents.map((i) => i.timestamp.getTime()))
        ),
        end: new Date(Math.max(...incidents.map((i) => i.timestamp.getTime()))),
      },
      zoneAnalysis,
      recommendations,
      summary: await this.generateSummary(incidents, zoneAnalysis, recommendations),
      confidenceScore: this.calculateConfidence(incidents, zoneAnalysis),
    };

    // Update configuration file
    this.updateConfigFile(report);

    return report;
  }

  private gatherIncidentData(): IncidentSummary[] {
    const conversations = this.db.getRecentConversations(100);
    const incidents: IncidentSummary[] = [];

    for (const conv of conversations) {
      const conclusion = this.db.getConclusion(conv.conversationId);
      if (!conclusion) continue;

      incidents.push({
        location: conv.location,
        cameraId: conv.cameraId,
        verdict: conclusion.finalVerdict,
        confidence: conclusion.combinedConfidence,
        audioFindings: conclusion.audioAgentAnalysis.evidencePoints,
        visualFindings: conclusion.visionAgentAnalysis.evidencePoints,
        timestamp: conv.startedAt,
      });
    }

    return incidents;
  }

  private analyzeByZone(incidents: IncidentSummary[]): ZoneAnalysis[] {
    const zoneMap = new Map<string, IncidentSummary[]>();

    for (const incident of incidents) {
      const zone = this.extractZoneFromLocation(incident.location);
      if (!zoneMap.has(zone)) {
        zoneMap.set(zone, []);
      }
      zoneMap.get(zone)!.push(incident);
    }

    const analyses: ZoneAnalysis[] = [];

    for (const [zoneName, zoneIncidents] of zoneMap) {
      const confirmedThreats = zoneIncidents.filter(
        (i) => i.verdict === "confirmed_threat"
      ).length;
      const falsePositives = zoneIncidents.filter(
        (i) => i.verdict === "false_positive"
      ).length;

      const allFindings = [
        ...zoneIncidents.flatMap((i) => i.audioFindings),
        ...zoneIncidents.flatMap((i) => i.visualFindings),
      ];
      const patternCounts = new Map<string, number>();
      for (const finding of allFindings) {
        const normalized = finding.toLowerCase();
        patternCounts.set(normalized, (patternCounts.get(normalized) || 0) + 1);
      }
      const commonPatterns = [...patternCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([pattern]) => pattern);

      const riskScore = this.calculateZoneRisk(
        confirmedThreats,
        zoneIncidents.length,
        zoneIncidents.map((i) => i.confidence)
      );

      analyses.push({
        zoneId: this.normalizeZoneId(zoneName),
        zoneName,
        incidentCount: zoneIncidents.length,
        confirmedThreats,
        falsePositives,
        commonPatterns,
        riskScore,
      });
    }

    return analyses.sort((a, b) => b.riskScore - a.riskScore);
  }

  private async generateRecommendations(
    incidents: IncidentSummary[],
    zoneAnalysis: ZoneAnalysis[]
  ): Promise<StoreRecommendation[]> {
    // Read current configuration
    const currentConfig = this.readConfigFile();

    if (isGeminiConfigured()) {
      return this.generateAIRecommendations(
        incidents,
        zoneAnalysis,
        currentConfig
      );
    }

    return this.generateRuleBasedRecommendations(zoneAnalysis);
  }

  private async generateAIRecommendations(
    incidents: IncidentSummary[],
    zoneAnalysis: ZoneAnalysis[],
    currentConfig: string
  ): Promise<StoreRecommendation[]> {
    const gemini = getGeminiClient();

    const prompt = `You are a retail loss prevention consultant. Analyze the following incident data and current store configuration to generate specific, actionable recommendations.

## Current Store Configuration:
${currentConfig}

## Incident Analysis by Zone:
${JSON.stringify(zoneAnalysis, null, 2)}

## Recent Incidents Summary:
${incidents
  .slice(0, 10)
  .map(
    (i) =>
      `- ${i.location}: ${i.verdict} (confidence: ${(i.confidence * 100).toFixed(0)}%)`
  )
  .join("\n")}

Generate 5-8 specific recommendations to reduce theft and improve detection. Consider:
1. Camera placement optimization
2. Staff positioning changes
3. Store layout modifications
4. Technology upgrades (EAS gates, mirrors, etc.)
5. Training needs
6. Signage placement

Return JSON array:
[
  {
    "priority": "critical|high|medium|low",
    "category": "camera|staffing|layout|signage|technology|training",
    "location": "Specific area or zone",
    "recommendation": "Clear action item",
    "rationale": "Why this helps based on incident data",
    "estimatedImpact": "Expected improvement"
  }
]`;

    try {
      const response = await gemini.textCompletion(
        [
          {
            role: "system",
            content:
              "You are an expert retail loss prevention consultant. Provide specific, data-driven recommendations.",
          },
          { role: "user", content: prompt },
        ],
        { maxTokens: 2000, jsonResponse: true }
      );

      const recommendations = JSON.parse(response);
      return Array.isArray(recommendations) ? recommendations : [];
    } catch (error) {
      console.error("[StoreOptimizer] AI recommendation error:", error);
      return this.generateRuleBasedRecommendations(zoneAnalysis);
    }
  }

  private generateRuleBasedRecommendations(
    zoneAnalysis: ZoneAnalysis[]
  ): StoreRecommendation[] {
    const recommendations: StoreRecommendation[] = [];

    for (const zone of zoneAnalysis) {
      if (zone.riskScore >= 0.7) {
        recommendations.push({
          priority: "critical",
          category: "camera",
          location: zone.zoneName,
          recommendation: `Add additional camera coverage to ${zone.zoneName}`,
          rationale: `High risk score (${(zone.riskScore * 100).toFixed(0)}%) with ${zone.confirmedThreats} confirmed incidents`,
          estimatedImpact: "30-40% reduction in theft incidents",
        });

        recommendations.push({
          priority: "high",
          category: "staffing",
          location: zone.zoneName,
          recommendation: `Increase staff presence in ${zone.zoneName} during peak hours`,
          rationale: `${zone.incidentCount} total incidents detected in this zone`,
          estimatedImpact: "Improved deterrence and faster response",
        });
      } else if (zone.riskScore >= 0.4) {
        recommendations.push({
          priority: "medium",
          category: "signage",
          location: zone.zoneName,
          recommendation: `Add visible loss prevention signage in ${zone.zoneName}`,
          rationale: `Moderate risk (${(zone.riskScore * 100).toFixed(0)}%) - deterrence approach recommended`,
          estimatedImpact: "15-20% reduction through deterrence",
        });
      }

      if (zone.commonPatterns.includes("camera obstruction positioning")) {
        recommendations.push({
          priority: "high",
          category: "layout",
          location: zone.zoneName,
          recommendation: `Reconfigure display layout in ${zone.zoneName} to eliminate camera blind spots`,
          rationale: "Camera obstruction pattern detected in incidents",
          estimatedImpact: "Eliminate blind spots used for concealment",
        });
      }

      if (zone.commonPatterns.some((p) => p.includes("coordination"))) {
        recommendations.push({
          priority: "high",
          category: "training",
          location: zone.zoneName,
          recommendation: `Train staff on recognizing coordinated theft patterns in ${zone.zoneName}`,
          rationale: "Multiple incidents show coordinated theft behavior",
          estimatedImpact: "Improved detection of organized retail theft",
        });
      }
    }

    return recommendations.slice(0, 8);
  }

  private async generateSummary(
    incidents: IncidentSummary[],
    zoneAnalysis: ZoneAnalysis[],
    recommendations: StoreRecommendation[]
  ): Promise<string> {
    const confirmedThreats = incidents.filter(
      (i) => i.verdict === "confirmed_threat"
    ).length;
    const falsePositives = incidents.filter(
      (i) => i.verdict === "false_positive"
    ).length;
    const highRiskZones = zoneAnalysis.filter((z) => z.riskScore >= 0.6);
    const criticalRecs = recommendations.filter(
      (r) => r.priority === "critical"
    ).length;

    if (isGeminiConfigured()) {
      try {
        const gemini = getGeminiClient();
        const response = await gemini.textCompletion(
          [
            {
              role: "user",
              content: `Write a 2-3 sentence executive summary for a loss prevention report with: ${confirmedThreats} confirmed theft incidents, ${falsePositives} false positives, ${highRiskZones.length} high-risk zones, and ${criticalRecs} critical recommendations. Be concise and professional.`,
            },
          ],
          { maxTokens: 150 }
        );
        return response;
      } catch {
        // Fall through to rule-based
      }
    }

    return `Analysis of ${incidents.length} incidents identified ${confirmedThreats} confirmed threats across ${zoneAnalysis.length} zones. ${highRiskZones.length} zone(s) rated high-risk requiring immediate attention. ${criticalRecs} critical recommendations generated to improve loss prevention coverage.`;
  }

  private updateConfigFile(report: AnalysisReport): void {
    const currentConfig = this.readConfigFile();

    // Generate recommendations markdown
    const recsMarkdown = report.recommendations
      .map(
        (r, i) =>
          `### ${i + 1}. [${r.priority.toUpperCase()}] ${r.recommendation}
- **Category:** ${r.category}
- **Location:** ${r.location}
- **Rationale:** ${r.rationale}
- **Expected Impact:** ${r.estimatedImpact}
`
      )
      .join("\n");

    // Generate zone risk table
    const zoneTable = `| Zone | Incidents | Confirmed | Risk Score |
|------|-----------|-----------|------------|
${report.zoneAnalysis.map((z) => `| ${z.zoneName} | ${z.incidentCount} | ${z.confirmedThreats} | ${(z.riskScore * 100).toFixed(0)}% |`).join("\n")}`;

    // Find and replace the recommendations section
    const updatedConfig = currentConfig.replace(
      /## Recommendations History[\s\S]*?(?=---\s*\n\s*## Analysis Metadata|$)/,
      `## Recommendations History

### Generated: ${report.generatedAt.toISOString().split("T")[0]}

${report.summary}

---

## Zone Risk Assessment

${zoneTable}

---

## Recommended Actions

${recsMarkdown}

---

`
    );

    // Update analysis metadata
    const finalConfig = updatedConfig.replace(
      /## Analysis Metadata[\s\S]*$/,
      `## Analysis Metadata
- **Last Analysis:** ${report.generatedAt.toISOString()}
- **Incidents Analyzed:** ${report.incidentsAnalyzed}
- **Confidence Score:** ${(report.confidenceScore * 100).toFixed(0)}%
- **Time Range:** ${report.timeRange.start.toISOString().split("T")[0]} to ${report.timeRange.end.toISOString().split("T")[0]}
`
    );

    writeFileSync(CONFIG_PATH, finalConfig);
  }

  private readConfigFile(): string {
    try {
      return readFileSync(CONFIG_PATH, "utf-8");
    } catch {
      return "";
    }
  }

  private extractZoneFromLocation(location: string): string {
    return location.split(" - ")[0] || location;
  }

  private normalizeZoneId(zoneName: string): string {
    return `zone-${zoneName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  }

  private calculateZoneRisk(
    threats: number,
    total: number,
    confidences: number[]
  ): number {
    if (total === 0) return 0;
    const threatRatio = threats / total;
    const avgConfidence =
      confidences.length > 0
        ? confidences.reduce((a, b) => a + b, 0) / confidences.length
        : 0.5;
    return threatRatio * 0.6 + avgConfidence * 0.4;
  }

  private calculateConfidence(
    incidents: IncidentSummary[],
    zoneAnalysis: ZoneAnalysis[]
  ): number {
    if (incidents.length < 5) return 0.3;
    if (incidents.length < 10) return 0.5;
    if (incidents.length < 20) return 0.7;
    return 0.85;
  }

  private emptyReport(): AnalysisReport {
    return {
      generatedAt: new Date(),
      incidentsAnalyzed: 0,
      timeRange: { start: new Date(), end: new Date() },
      zoneAnalysis: [],
      recommendations: [],
      summary: "No incidents to analyze. Gathering more data.",
      confidenceScore: 0,
    };
  }
}

let optimizerInstance: StoreOptimizer | null = null;

export function getStoreOptimizer(): StoreOptimizer {
  if (!optimizerInstance) {
    optimizerInstance = new StoreOptimizer();
  }
  return optimizerInstance;
}
