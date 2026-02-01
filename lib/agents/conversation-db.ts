/**
 * Agent Conversation Database
 *
 * SQLite database for storing agent conversations, analyses, and conclusions.
 * Uses better-sqlite3 for synchronous operations in Node.js.
 */

import Database from "better-sqlite3";
import path from "path";
import { mkdirSync } from "fs";
import type {
  AgentMessage,
  ConversationConclusion,
  ConversationContext,
  AgentAnalysis,
} from "./types";

const DB_PATH = path.join(process.cwd(), "data", "agent_conversations.db");

export class ConversationDatabase {
  private db: Database.Database;

  constructor(dbPath: string = DB_PATH) {
    // Ensure data directory exists
    const dir = path.dirname(dbPath);
    mkdirSync(dir, { recursive: true });

    this.db = new Database(dbPath);
    this.initialize();
  }

  private initialize(): void {
    this.db.exec(`
      -- Conversations table
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        incident_id TEXT NOT NULL,
        camera_id TEXT NOT NULL,
        location TEXT NOT NULL,
        started_at TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'analyzing',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      -- Agent messages table
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        content TEXT NOT NULL,
        reply_to TEXT,
        confidence REAL,
        evidence_type TEXT,
        timestamp TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id)
      );

      -- Agent analyses table
      CREATE TABLE IF NOT EXISTS analyses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        is_suspicious INTEGER NOT NULL,
        confidence REAL NOT NULL,
        reasoning TEXT NOT NULL,
        evidence_points TEXT NOT NULL,
        false_positive_risks TEXT NOT NULL,
        recommended_action TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id)
      );

      -- Conclusions table
      CREATE TABLE IF NOT EXISTS conclusions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id TEXT UNIQUE NOT NULL,
        incident_id TEXT NOT NULL,
        final_verdict TEXT NOT NULL,
        combined_confidence REAL NOT NULL,
        summary TEXT NOT NULL,
        consensus_reached INTEGER NOT NULL,
        decided_at TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id)
      );

      -- Indexes for common queries
      CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_analyses_conversation ON analyses(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_conversations_incident ON conversations(incident_id);
      CREATE INDEX IF NOT EXISTS idx_conversations_camera ON conversations(camera_id);
      CREATE INDEX IF NOT EXISTS idx_conclusions_verdict ON conclusions(final_verdict);
    `);
  }

  saveConversation(context: ConversationContext): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO conversations (id, incident_id, camera_id, location, started_at, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      context.conversationId,
      context.incidentId,
      context.cameraId,
      context.location,
      context.startedAt.toISOString(),
      context.status
    );
  }

  saveMessage(conversationId: string, message: AgentMessage): void {
    const stmt = this.db.prepare(`
      INSERT INTO messages (id, conversation_id, agent_id, content, reply_to, confidence, evidence_type, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      message.id,
      conversationId,
      message.agentId,
      message.content,
      message.replyTo || null,
      message.metadata?.confidence || null,
      message.metadata?.evidenceType || null,
      message.timestamp.toISOString()
    );
  }

  saveAnalysis(conversationId: string, analysis: AgentAnalysis): void {
    const stmt = this.db.prepare(`
      INSERT INTO analyses (conversation_id, agent_id, is_suspicious, confidence, reasoning, evidence_points, false_positive_risks, recommended_action)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      conversationId,
      analysis.agentId,
      analysis.isSuspicious ? 1 : 0,
      analysis.confidence,
      analysis.reasoning,
      JSON.stringify(analysis.evidencePoints),
      JSON.stringify(analysis.falsePositiveRisks),
      analysis.recommendedAction
    );
  }

  saveConclusion(conclusion: ConversationConclusion): void {
    // Update conversation status
    this.db
      .prepare(`UPDATE conversations SET status = 'concluded' WHERE id = ?`)
      .run(conclusion.conversationId);

    // Save both analyses
    this.saveAnalysis(conclusion.conversationId, conclusion.audioAgentAnalysis);
    this.saveAnalysis(conclusion.conversationId, conclusion.visionAgentAnalysis);

    // Save conclusion
    const stmt = this.db.prepare(`
      INSERT INTO conclusions (conversation_id, incident_id, final_verdict, combined_confidence, summary, consensus_reached, decided_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      conclusion.conversationId,
      conclusion.incidentId,
      conclusion.finalVerdict,
      conclusion.combinedConfidence,
      conclusion.summary,
      conclusion.consensusReached ? 1 : 0,
      conclusion.decidedAt.toISOString()
    );
  }

  getConversation(conversationId: string): ConversationContext | null {
    const row = this.db
      .prepare(`SELECT * FROM conversations WHERE id = ?`)
      .get(conversationId) as any;
    if (!row) return null;

    const messages = this.getMessages(conversationId);
    return {
      conversationId: row.id,
      incidentId: row.incident_id,
      cameraId: row.camera_id,
      location: row.location,
      startedAt: new Date(row.started_at),
      messages,
      status: row.status,
    };
  }

  getMessages(conversationId: string): AgentMessage[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM messages WHERE conversation_id = ? ORDER BY timestamp ASC`
      )
      .all(conversationId) as any[];

    return rows.map((row) => ({
      id: row.id,
      agentId: row.agent_id,
      timestamp: new Date(row.timestamp),
      content: row.content,
      replyTo: row.reply_to || undefined,
      metadata: {
        confidence: row.confidence || undefined,
        evidenceType: row.evidence_type || undefined,
      },
    }));
  }

  getConclusion(conversationId: string): ConversationConclusion | null {
    const row = this.db
      .prepare(`SELECT * FROM conclusions WHERE conversation_id = ?`)
      .get(conversationId) as any;
    if (!row) return null;

    const analyses = this.db
      .prepare(`SELECT * FROM analyses WHERE conversation_id = ?`)
      .all(conversationId) as any[];

    const audioAnalysis = analyses.find((a) => a.agent_id === "audio_agent");
    const visionAnalysis = analyses.find((a) => a.agent_id === "vision_agent");

    return {
      conversationId: row.conversation_id,
      incidentId: row.incident_id,
      finalVerdict: row.final_verdict,
      combinedConfidence: row.combined_confidence,
      summary: row.summary,
      audioAgentAnalysis: this.parseAnalysis(audioAnalysis),
      visionAgentAnalysis: this.parseAnalysis(visionAnalysis),
      consensusReached: row.consensus_reached === 1,
      decidedAt: new Date(row.decided_at),
    };
  }

  getRecentConversations(limit: number = 50): ConversationContext[] {
    const rows = this.db
      .prepare(`SELECT * FROM conversations ORDER BY started_at DESC LIMIT ?`)
      .all(limit) as any[];

    return rows.map((row) => ({
      conversationId: row.id,
      incidentId: row.incident_id,
      cameraId: row.camera_id,
      location: row.location,
      startedAt: new Date(row.started_at),
      messages: this.getMessages(row.id),
      status: row.status,
    }));
  }

  getStatistics(): {
    totalConversations: number;
    confirmedThreats: number;
    falsePositives: number;
    consensusRate: number;
  } {
    const total = (
      this.db
        .prepare(`SELECT COUNT(*) as count FROM conversations`)
        .get() as any
    ).count;
    const conclusions = this.db
      .prepare(`SELECT final_verdict, consensus_reached FROM conclusions`)
      .all() as any[];

    return {
      totalConversations: total,
      confirmedThreats: conclusions.filter(
        (c) => c.final_verdict === "confirmed_threat"
      ).length,
      falsePositives: conclusions.filter(
        (c) => c.final_verdict === "false_positive"
      ).length,
      consensusRate:
        conclusions.length > 0
          ? conclusions.filter((c) => c.consensus_reached).length /
            conclusions.length
          : 0,
    };
  }

  private parseAnalysis(row: any): AgentAnalysis {
    if (!row) {
      return {
        agentId: "audio_agent",
        isSuspicious: false,
        confidence: 0,
        reasoning: "No analysis available",
        evidencePoints: [],
        falsePositiveRisks: [],
        recommendedAction: "dismiss",
      };
    }
    return {
      agentId: row.agent_id,
      isSuspicious: row.is_suspicious === 1,
      confidence: row.confidence,
      reasoning: row.reasoning,
      evidencePoints: JSON.parse(row.evidence_points),
      falsePositiveRisks: JSON.parse(row.false_positive_risks),
      recommendedAction: row.recommended_action,
    };
  }

  close(): void {
    this.db.close();
  }
}

let dbInstance: ConversationDatabase | null = null;

export function getConversationDatabase(): ConversationDatabase {
  if (!dbInstance) {
    dbInstance = new ConversationDatabase();
  }
  return dbInstance;
}
