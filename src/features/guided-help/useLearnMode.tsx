// src/features/guided-help/useLearnMode.tsx
// Contexto e Hook para controle do Modo Aprender (Learn Mode), Glossário, Drawer Contextual e Tours.
// Persistência local segura apenas de preferências de interface (zero dados de produto).

import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { HelpConceptId, TaskTutorial, TaskTutorialId, TourStep } from './types';
import { TASK_TUTORIALS_REGISTRY, LIBRARY_V2_TOUR_STEPS } from './help-registry';

interface LearnModeContextValue {
  /** Indica se os mini-hotspots e dicas contextuais estão visíveis na UI */
  isLearnModeActive: boolean;
  toggleLearnMode: () => void;
  setLearnMode: (active: boolean) => void;

  /** Conceito ativo no modal ou drawer de detalhes */
  activeConceptId: HelpConceptId | null;
  openConceptDetail: (conceptId: HelpConceptId) => void;
  closeConceptDetail: () => void;

  /** Controle do Drawer Global de Glossário */
  isGlossaryOpen: boolean;
  glossarySearchTerm: string;
  openGlossary: (initialSearch?: string) => void;
  closeGlossary: () => void;
  setGlossarySearchTerm: (term: string) => void;

  /** Painel "Entenda esta área" (Context Help Drawer) */
  contextHelpId: HelpConceptId | null;
  openContextHelp: (conceptId: HelpConceptId) => void;
  closeContextHelp: () => void;

  /** Tutorial de Tarefa Interativo */
  activeTutorial: TaskTutorial | null;
  openTutorial: (tutorialId: TaskTutorialId) => void;
  closeTutorial: () => void;

  /** Tour Guiado Passo a Passo */
  isTourActive: boolean;
  currentTourStepIndex: number;
  currentTourStep: TourStep | null;
  totalTourSteps: number;
  startTour: () => void;
  nextTourStep: () => void;
  prevTourStep: () => void;
  skipTour: () => void;
  finishTour: () => void;
}

const LearnModeContext = createContext<LearnModeContextValue | null>(null);

const STORAGE_KEY_LEARN_MODE = 'pim_library_v2_learn_mode';
const STORAGE_KEY_TOUR_COMPLETED = 'pim_library_v2_tour_seen';

export const LearnModeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isLearnModeActive, setIsLearnModeActiveState] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return localStorage.getItem(STORAGE_KEY_LEARN_MODE) === 'true';
    } catch {
      return false;
    }
  });

  const [activeConceptId, setActiveConceptId] = useState<HelpConceptId | null>(null);
  const [isGlossaryOpen, setIsGlossaryOpen] = useState<boolean>(false);
  const [glossarySearchTerm, setGlossarySearchTerm] = useState<string>('');
  const [contextHelpId, setContextHelpId] = useState<HelpConceptId | null>(null);
  const [activeTutorial, setActiveTutorial] = useState<TaskTutorial | null>(null);

  // Tour State
  const [isTourActive, setIsTourActive] = useState<boolean>(false);
  const [currentTourStepIndex, setCurrentTourStepIndex] = useState<number>(0);

  const toggleLearnMode = useCallback(() => {
    setIsLearnModeActiveState((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY_LEARN_MODE, String(next));
      } catch {
        // Ignora falhas de localStorage em ambientes restritos
      }
      return next;
    });
  }, []);

  const setLearnMode = useCallback((active: boolean) => {
    setIsLearnModeActiveState(active);
    try {
      localStorage.setItem(STORAGE_KEY_LEARN_MODE, String(active));
    } catch {
      // Ignora
    }
  }, []);

  const openConceptDetail = useCallback((conceptId: HelpConceptId) => {
    setActiveConceptId(conceptId);
  }, []);

  const closeConceptDetail = useCallback(() => {
    setActiveConceptId(null);
  }, []);

  const openGlossary = useCallback((initialSearch?: string) => {
    if (initialSearch !== undefined) {
      setGlossarySearchTerm(initialSearch);
    }
    setIsGlossaryOpen(true);
  }, []);

  const closeGlossary = useCallback(() => {
    setIsGlossaryOpen(false);
  }, []);

  const openContextHelp = useCallback((conceptId: HelpConceptId) => {
    setContextHelpId(conceptId);
  }, []);

  const closeContextHelp = useCallback(() => {
    setContextHelpId(null);
  }, []);

  const openTutorial = useCallback((tutorialId: TaskTutorialId) => {
    const tut = TASK_TUTORIALS_REGISTRY[tutorialId] || null;
    setActiveTutorial(tut);
  }, []);

  const closeTutorial = useCallback(() => {
    setActiveTutorial(null);
  }, []);

  // Tour handlers
  const startTour = useCallback(() => {
    setCurrentTourStepIndex(0);
    setIsTourActive(true);
  }, []);

  const nextTourStep = useCallback(() => {
    setCurrentTourStepIndex((prev) => {
      if (prev + 1 < LIBRARY_V2_TOUR_STEPS.length) {
        return prev + 1;
      }
      setIsTourActive(false);
      try {
        localStorage.setItem(STORAGE_KEY_TOUR_COMPLETED, 'true');
      } catch {
        // Ignora
      }
      return 0;
    });
  }, []);

  const prevTourStep = useCallback(() => {
    setCurrentTourStepIndex((prev) => (prev > 0 ? prev - 1 : 0));
  }, []);

  const skipTour = useCallback(() => {
    setIsTourActive(false);
    try {
      localStorage.setItem(STORAGE_KEY_TOUR_COMPLETED, 'true');
    } catch {
      // Ignora
    }
  }, []);

  const finishTour = useCallback(() => {
    setIsTourActive(false);
    try {
      localStorage.setItem(STORAGE_KEY_TOUR_COMPLETED, 'true');
    } catch {
      // Ignora
    }
  }, []);

  const currentTourStep = useMemo(() => {
    if (!isTourActive) return null;
    return LIBRARY_V2_TOUR_STEPS[currentTourStepIndex] || null;
  }, [isTourActive, currentTourStepIndex]);

  // Tecla Esc global para fechar drawers abertos
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isTourActive) {
          skipTour();
        } else if (activeTutorial) {
          closeTutorial();
        } else if (contextHelpId) {
          closeContextHelp();
        } else if (isGlossaryOpen) {
          closeGlossary();
        } else if (activeConceptId) {
          closeConceptDetail();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isTourActive, activeTutorial, contextHelpId, isGlossaryOpen, activeConceptId, skipTour, closeTutorial, closeContextHelp, closeGlossary, closeConceptDetail]);

  const value = useMemo<LearnModeContextValue>(
    () => ({
      isLearnModeActive,
      toggleLearnMode,
      setLearnMode,
      activeConceptId,
      openConceptDetail,
      closeConceptDetail,
      isGlossaryOpen,
      glossarySearchTerm,
      openGlossary,
      closeGlossary,
      setGlossarySearchTerm,
      contextHelpId,
      openContextHelp,
      closeContextHelp,
      activeTutorial,
      openTutorial,
      closeTutorial,
      isTourActive,
      currentTourStepIndex,
      currentTourStep,
      totalTourSteps: LIBRARY_V2_TOUR_STEPS.length,
      startTour,
      nextTourStep,
      prevTourStep,
      skipTour,
      finishTour
    }),
    [
      isLearnModeActive,
      toggleLearnMode,
      setLearnMode,
      activeConceptId,
      openConceptDetail,
      closeConceptDetail,
      isGlossaryOpen,
      glossarySearchTerm,
      openGlossary,
      closeGlossary,
      contextHelpId,
      openContextHelp,
      closeContextHelp,
      activeTutorial,
      openTutorial,
      closeTutorial,
      isTourActive,
      currentTourStepIndex,
      currentTourStep,
      startTour,
      nextTourStep,
      prevTourStep,
      skipTour,
      finishTour
    ]
  );

  return <LearnModeContext.Provider value={value}>{children}</LearnModeContext.Provider>;
};

export const useLearnMode = (): LearnModeContextValue => {
  const context = useContext(LearnModeContext);
  if (!context) {
    throw new Error('useLearnMode deve ser utilizado dentro de um LearnModeProvider.');
  }
  return context;
};
