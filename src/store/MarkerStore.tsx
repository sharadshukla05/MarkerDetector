/**
 * MarkerStore.tsx
 *
 * Global context / store for the 20 captured marker frames.
 * Each entry holds a base64-encoded JPEG of the 300×300 extracted patch.
 *
 * Fix: addMarker now uses a functional reducer dispatch that computes the
 * frame index from state inside the reducer itself, eliminating the stale
 * closure bug that existed in the original dual-callback approach.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useReducer,
} from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MarkerEntry {
  id: string;         // `marker_<timestamp>_<frameIndex>`
  base64: string;     // base64 JPEG, no data: prefix
  capturedAt: number; // Date.now()
  frameIndex: number; // 1-based capture index
}

interface MarkerState {
  markers: MarkerEntry[];
  isCapturing: boolean;
  captureCount: number;
}

type MarkerAction =
  | {type: 'ADD_MARKER'; payload: {base64: string; capturedAt: number}}
  | {type: 'RESET'}
  | {type: 'SET_CAPTURING'; payload: boolean};

// ─── Constants ────────────────────────────────────────────────────────────────

export const MAX_MARKERS = 20;

// ─── Reducer ─────────────────────────────────────────────────────────────────

const initialState: MarkerState = {
  markers: [],
  isCapturing: false,
  captureCount: 0,
};

function markerReducer(state: MarkerState, action: MarkerAction): MarkerState {
  switch (action.type) {
    case 'ADD_MARKER': {
      if (state.markers.length >= MAX_MARKERS) {
        return state;
      }
      const frameIndex = state.markers.length + 1;
      const entry: MarkerEntry = {
        id: `marker_${action.payload.capturedAt}_${frameIndex}`,
        base64: action.payload.base64,
        capturedAt: action.payload.capturedAt,
        frameIndex,
      };
      const markers = [...state.markers, entry];
      return {
        ...state,
        markers,
        captureCount: markers.length,
        isCapturing: markers.length < MAX_MARKERS,
      };
    }
    case 'RESET':
      return {...initialState};
    case 'SET_CAPTURING':
      return {...state, isCapturing: action.payload};
    default:
      return state;
  }
}

// ─── Context ─────────────────────────────────────────────────────────────────

interface MarkerContextValue {
  state: MarkerState;
  /** Add a new base64 JPEG marker. ID and frameIndex are computed in reducer. */
  addMarker: (base64: string) => void;
  reset: () => void;
  startCapturing: () => void;
}

const MarkerContext = createContext<MarkerContextValue | null>(null);

export const MarkerStoreProvider: React.FC<{children: React.ReactNode}> = ({
  children,
}) => {
  const [state, dispatch] = useReducer(markerReducer, initialState);

  const addMarker = useCallback((base64: string) => {
    dispatch({
      type: 'ADD_MARKER',
      payload: {base64, capturedAt: Date.now()},
    });
  }, []); // stable — no deps, dispatch is stable from useReducer

  const reset = useCallback(() => dispatch({type: 'RESET'}), []);

  const startCapturing = useCallback(
    () => dispatch({type: 'SET_CAPTURING', payload: true}),
    [],
  );

  return (
    <MarkerContext.Provider value={{state, addMarker, reset, startCapturing}}>
      {children}
    </MarkerContext.Provider>
  );
};

export const useMarkerStore = (): MarkerContextValue => {
  const ctx = useContext(MarkerContext);
  if (!ctx) {
    throw new Error('useMarkerStore must be used inside MarkerStoreProvider');
  }
  return ctx;
};
