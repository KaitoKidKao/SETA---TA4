import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import xlsx from 'xlsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../../../..');

export interface SLATrackerItem {
  feedbackId: string;
  candidateName: string;
  position: string;
  hiringManager: string;
  shortlistedDatetime: string;
  feedbackDeadline: string;
  slaBreach: boolean;
  feedbackStatus: string;
  hmDecision: string | null;
  hmFeedbackText: string | null;
}

interface FeedbackTrackerRow {
  feedback_id?: string | number;
  candidate_name?: string;
  position?: string;
  hiring_manager?: string;
  shortlisted_datetime?: string | number;
  feedback_deadline_48h?: string | number;
  sla_breach?: string;
  feedback_status?: string;
  hm_decision?: string;
  hm_feedback_text?: string;
}

export function getSLATracker(): SLATrackerItem[] {
  const filePath = path.resolve(repoRoot, 'mock-data/03_ta_hire_request_jd_generation.xlsx');

  try {
    const workbook = xlsx.readFile(filePath);
    const feedbackSheet = workbook.Sheets.DS08_HM_Feedback_Tracker;
    if (!feedbackSheet) {
      return [];
    }

    const rows = xlsx.utils.sheet_to_json<FeedbackTrackerRow>(feedbackSheet);

    return rows.map((row) => {
      return {
        feedbackId: String(row.feedback_id || ''),
        candidateName: String(row.candidate_name || ''),
        position: String(row.position || ''),
        hiringManager: String(row.hiring_manager || ''),
        shortlistedDatetime: String(row.shortlisted_datetime || ''),
        feedbackDeadline: String(row.feedback_deadline_48h || ''),
        slaBreach: String(row.sla_breach || '').toUpperCase() === 'Y',
        feedbackStatus: String(row.feedback_status || 'Pending'),
        hmDecision: row.hm_decision ? String(row.hm_decision) : null,
        hmFeedbackText: row.hm_feedback_text ? String(row.hm_feedback_text) : null,
      };
    });
  } catch (err) {
    console.error('Failed to parse SLA feedback tracker:', err);
    return [];
  }
}
