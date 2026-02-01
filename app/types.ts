
export type CaseStatus = 'fired' | 'assigned' | 'audit' | 'reverted' | 'completed';

export interface Case {
  id: string;
  client: string;
  matrixRefNo: string;
  checkType: string;
  company: string;
  candidateName: string;
  address: string;
  chkType: string;
  dateInitiated: string;
  status: CaseStatus;
  city: string;
}

export type ThemeMode = 'light' | 'dark';
