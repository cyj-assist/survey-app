export type QuestionType = 'short' | 'long' | 'ox' | 'single' | 'multi';

export interface Question {
  id: string;
  type: QuestionType;
  title: string;
  description?: string;
  options?: string[]; // For single/multi choice
  required: boolean;
  order: number;
  sectionId?: string; // New: Section this question belongs to
}

export interface SurveySection {
  id: string;
  title: string;
  description?: string;
  order: number;
}

export interface PDFTemplateConfig {
  logoUrl?: string;
  primaryColor: string;
  layout: 'standard' | 'compact' | 'detailed';
  showGraphs: boolean;
  showTable: boolean;
}

export interface Survey {
  id: string;
  title: string;
  description: string;
  openMessage: string;
  instructions?: string; // New: Instruction bullet points
  closingMessage: string;
  completionTitle?: string; // New: Title for thank you page
  status: 'draft' | 'active' | 'closed';
  createdAt: number;
  updatedAt: number;
  createdBy: string;
  settings: {
    antiDuplication: boolean;
    pdfTemplate?: PDFTemplateConfig;
  };
  questions: Question[];
  sections?: SurveySection[]; // New: Optional sections
  respondentCount?: number;
  targetRespondentCount?: number;
  groupTag?: string;
}

export interface ResponseAnswer {
  questionId: string;
  value: string | string[] | boolean;
}

export interface SurveyResponse {
  id: string;
  surveyId: string;
  answers: ResponseAnswer[];
  submittedAt: number;
  respondentId: string; // Unique identifier for anti-duplication
  metadata: {
    userAgent: string;
    ip?: string;
  };
}
