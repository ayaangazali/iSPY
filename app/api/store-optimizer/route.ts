/**
 * Store Optimizer API
 *
 * POST /api/store-optimizer - Run analysis and update configuration
 * GET /api/store-optimizer - Get current configuration and last analysis
 */

import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "fs";
import path from "path";
import { getStoreOptimizer } from "@/lib/store-optimizer/analyzer";

const CONFIG_PATH = path.join(process.cwd(), "data", "store-configuration.md");

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const optimizer = getStoreOptimizer();
    const report = await optimizer.analyze();

    return NextResponse.json({
      success: true,
      report: {
        generatedAt: report.generatedAt,
        incidentsAnalyzed: report.incidentsAnalyzed,
        timeRange: report.timeRange,
        summary: report.summary,
        confidenceScore: report.confidenceScore,
        zoneCount: report.zoneAnalysis.length,
        recommendationCount: report.recommendations.length,
        criticalRecommendations: report.recommendations.filter(
          (r) => r.priority === "critical"
        ).length,
        highRecommendations: report.recommendations.filter(
          (r) => r.priority === "high"
        ).length,
      },
      zoneAnalysis: report.zoneAnalysis,
      recommendations: report.recommendations,
      analysisTimeMs: Date.now() - startTime,
      configurationUpdated: true,
      configPath: "data/store-configuration.md",
    });
  } catch (error: any) {
    console.error("Store optimizer error:", error);
    return NextResponse.json(
      {
        error: error.message || "Analysis failed",
        analysisTimeMs: Date.now() - startTime,
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    let configuration = "";
    try {
      configuration = readFileSync(CONFIG_PATH, "utf-8");
    } catch {
      configuration = "Configuration file not found.";
    }

    // Extract metadata from config
    const lastAnalysisMatch = configuration.match(
      /\*\*Last Analysis:\*\* (.+)/
    );
    const incidentsMatch = configuration.match(
      /\*\*Incidents Analyzed:\*\* (\d+)/
    );
    const confidenceMatch = configuration.match(
      /\*\*Confidence Score:\*\* ([\d.]+)%/
    );

    return NextResponse.json({
      name: "Store Configuration Optimizer API",
      version: "1.0.0",
      description:
        "Analyzes incident data to generate store reconfiguration recommendations",
      configPath: "data/store-configuration.md",
      lastAnalysis: lastAnalysisMatch ? lastAnalysisMatch[1] : "Never",
      incidentsAnalyzed: incidentsMatch ? parseInt(incidentsMatch[1]) : 0,
      confidenceScore: confidenceMatch ? parseFloat(confidenceMatch[1]) : 0,
      endpoints: {
        "POST /api/store-optimizer": {
          description:
            "Run analysis on incident data and update store configuration",
          returns: "Analysis report with recommendations",
        },
        "GET /api/store-optimizer": {
          description: "Get current configuration status",
        },
      },
      configuration: configuration,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to get configuration" },
      { status: 500 }
    );
  }
}
