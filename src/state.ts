import { SPECIES_ORDER, type SpeciesId } from './data/species';

export type Phase = 'welcome' | 'explore' | 'finished';

export interface State {
  phase: Phase;
  point: number;
  found: SpeciesId[];
  selected: SpeciesId | null;
  hint: boolean;
  answer: number | null;
}

export type Action =
  | { type: 'start' }
  | { type: 'home' }
  | { type: 'goTo'; point: number }
  | { type: 'select'; id: SpeciesId }
  | { type: 'close' }
  | { type: 'register'; id: SpeciesId }
  | { type: 'hint' }
  | { type: 'clearHint' }
  | { type: 'answer'; index: number }
  | { type: 'dismiss' }
  | { type: 'review' }
  | { type: 'reset' };

export const initialState: State = {
  phase: 'welcome',
  point: 0,
  found: [],
  selected: null,
  hint: false,
  answer: null,
};

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'start':
      return { ...initialState, phase: 'explore' };
    case 'home':
      return initialState;
    case 'goTo':
      return { ...state, point: action.point, hint: false, selected: null };
    case 'select':
      return { ...state, selected: action.id };
    case 'close':
      return { ...state, selected: null };
    case 'register': {
      // Registro único: un hongo ya encontrado no vuelve a sumar progreso.
      if (state.found.includes(action.id)) return { ...state, selected: null };
      const found = [...state.found, action.id];
      const done = found.length === SPECIES_ORDER.length;
      return { ...state, found, selected: null, hint: false, phase: done ? 'finished' : state.phase };
    }
    case 'hint':
      return { ...state, hint: true };
    case 'clearHint':
      return { ...state, hint: false };
    case 'answer':
      return state.answer === null ? { ...state, answer: action.index } : state;
    case 'dismiss':
      return state.phase === 'finished' ? { ...state, phase: 'explore' } : state;
    case 'review':
      return state.found.length === SPECIES_ORDER.length ? { ...state, phase: 'finished' } : state;
    case 'reset':
      return { ...initialState, phase: 'explore' };
  }
}
