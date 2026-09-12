// Typed wrappers around the plain react-redux hooks — use these instead of
// the bare `useDispatch`/`useSelector` everywhere so state/dispatch stay
// typed as new slices are added, without repeating <RootState>/<AppDispatch>
// generics at every call site.
import { useDispatch, useSelector, TypedUseSelectorHook } from 'react-redux';
import type { RootState, AppDispatch } from './store';

export const useAppDispatch: () => AppDispatch = useDispatch;
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
