export interface RelevantCompany {
  id: string;
  name: string;
  verdict: string | null;
  vertical: string | null;
  url: string | null;
}
export interface Finding {
  subtopic: string;
  summary: string;
  findings: string[];
  relevant: RelevantCompany[];
  sources: { title: string; url: string }[];
  source: 'mock' | 'web';
}
