// src/types/voting.ts
// These interfaces describe the shape of data objects used in the VotingWizard.
// Think of them as contracts — if you pass a "Nominee" somewhere, TypeScript 
// will make sure it always has these fields with these types.

export interface Jurisdiction {
  jurisdictionId: string;
  name: string;
  votingEnabled?: boolean;
}

export interface Nominee {
  id: string;
  name: string;
  type: 'artist' | 'song';
  genreKey?: string;
  jurisdiction?: Jurisdiction | string; // Backend sometimes returns full object, sometimes just a string
  imageUrl?: string; // For displaying nominee artwork in the wizard
}

export interface VoteFilters {
  selectedGenre: string;
  selectedType: string;
  selectedInterval: string;
  selectedJurisdiction: string;
}

export interface VoteResult {
  status: 'idle' | 'success' | 'duplicate' | 'ineligible' | 'network' | 'error';
  message: string;
  details?: string;
}

export interface VoteData {
  userId: string;
  targetType: string;
  targetId: string;
  genreId: string;
  jurisdictionId: string;
  intervalId: string;
  voteDate: string;
}

export interface VotingWizardProps {
  visible: boolean;
  onClose: () => void;
  onVoteSuccess: (nomineeId: string) => void;
  nominee: Nominee | null;
  userId: string;
  filters?: Partial<VoteFilters>;
}