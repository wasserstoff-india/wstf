/**
 * WSTF Theme Configuration
 *
 * Neon green theme for WSTF Chain applications
 */

export interface WstfTheme {
  // Base colors
  colors: {
    // Primary neon green palette
    primary: {
      50: '#f0fdf4';   // Very light green
      100: '#dcfce7';  // Light green
      200: '#bbf7d0';  // Lighter green
      300: '#86efac';  // Light neon green
      400: '#4ade80';  // Medium neon green
      500: '#22c55e';  // Main neon green
      600: '#16a34a';  // Darker neon green
      700: '#15803d';  // Dark green
      800: '#166534';  // Very dark green
      900: '#14532d';  // Darkest green
      950: '#052e16';  // Almost black green
    },

    // Accent neon colors
    accent: {
      cyan: '#00ffff',     // Electric cyan
      lime: '#32ff32',     // Electric lime
      emerald: '#50ff89',  // Electric emerald
      mint: '#00ff7f',     // Electric mint
    },

    // Dark background palette
    dark: {
      50: '#f8fafc',   // White
      100: '#f1f5f9',  // Very light gray
      200: '#e2e8f0',  // Light gray
      300: '#cbd5e1',  // Medium light gray
      400: '#94a3b8',  // Medium gray
      500: '#64748b',  // Dark gray
      600: '#475569',  // Darker gray
      700: '#334155',  // Dark slate
      800: '#1e293b',  // Very dark slate
      900: '#0f172a',  // Almost black
      950: '#020617',  // Pure black
    },

    // Status colors with neon accents
    status: {
      success: '#22c55e',  // Neon green
      warning: '#f59e0b',  // Amber
      error: '#ef4444',    // Red
      info: '#3b82f6',     // Blue
    }
  },

  // Typography
  typography: {
    fontFamily: {
      sans: ['Inter', 'system-ui', 'sans-serif'],
      mono: ['JetBrains Mono', 'SF Mono', 'Consolas', 'monospace'],
    }
  },

  // Effects
  effects: {
    // Neon glow effects
    glow: {
      sm: '0 0 5px rgba(34, 197, 94, 0.5)',
      md: '0 0 10px rgba(34, 197, 94, 0.6)',
      lg: '0 0 20px rgba(34, 197, 94, 0.7)',
      xl: '0 0 40px rgba(34, 197, 94, 0.8)',
    },

    // Box shadows
    shadow: {
      sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
      md: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
      lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
      xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
    }
  }
}

// Default WSTF theme
export const wstfTheme: WstfTheme = {
  colors: {
    primary: {
      50: '#f0fdf4',
      100: '#dcfce7',
      200: '#bbf7d0',
      300: '#86efac',
      400: '#4ade80',
      500: '#22c55e',
      600: '#16a34a',
      700: '#15803d',
      800: '#166534',
      900: '#14532d',
      950: '#052e16',
    },
    accent: {
      cyan: '#00ffff',
      lime: '#32ff32',
      emerald: '#50ff89',
      mint: '#00ff7f',
    },
    dark: {
      50: '#f8fafc',
      100: '#f1f5f9',
      200: '#e2e8f0',
      300: '#cbd5e1',
      400: '#94a3b8',
      500: '#64748b',
      600: '#475569',
      700: '#334155',
      800: '#1e293b',
      900: '#0f172a',
      950: '#020617',
    },
    status: {
      success: '#22c55e',
      warning: '#f59e0b',
      error: '#ef4444',
      info: '#3b82f6',
    }
  },
  typography: {
    fontFamily: {
      sans: ['Inter', 'system-ui', 'sans-serif'],
      mono: ['JetBrains Mono', 'SF Mono', 'Consolas', 'monospace'],
    }
  },
  effects: {
    glow: {
      sm: '0 0 5px rgba(34, 197, 94, 0.5)',
      md: '0 0 10px rgba(34, 197, 94, 0.6)',
      lg: '0 0 20px rgba(34, 197, 94, 0.7)',
      xl: '0 0 40px rgba(34, 197, 94, 0.8)',
    },
    shadow: {
      sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
      md: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
      lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
      xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
    }
  }
};

// CSS custom properties for the theme
export const wstfThemeCSS = `
:root {
  /* Primary Colors */
  --wstf-primary-50: #f0fdf4;
  --wstf-primary-100: #dcfce7;
  --wstf-primary-200: #bbf7d0;
  --wstf-primary-300: #86efac;
  --wstf-primary-400: #4ade80;
  --wstf-primary-500: #22c55e;
  --wstf-primary-600: #16a34a;
  --wstf-primary-700: #15803d;
  --wstf-primary-800: #166534;
  --wstf-primary-900: #14532d;
  --wstf-primary-950: #052e16;

  /* Accent Colors */
  --wstf-accent-cyan: #00ffff;
  --wstf-accent-lime: #32ff32;
  --wstf-accent-emerald: #50ff89;
  --wstf-accent-mint: #00ff7f;

  /* Dark Colors */
  --wstf-dark-50: #f8fafc;
  --wstf-dark-100: #f1f5f9;
  --wstf-dark-200: #e2e8f0;
  --wstf-dark-300: #cbd5e1;
  --wstf-dark-400: #94a3b8;
  --wstf-dark-500: #64748b;
  --wstf-dark-600: #475569;
  --wstf-dark-700: #334155;
  --wstf-dark-800: #1e293b;
  --wstf-dark-900: #0f172a;
  --wstf-dark-950: #020617;

  /* Status Colors */
  --wstf-success: #22c55e;
  --wstf-warning: #f59e0b;
  --wstf-error: #ef4444;
  --wstf-info: #3b82f6;

  /* Effects */
  --wstf-glow-sm: 0 0 5px rgba(34, 197, 94, 0.5);
  --wstf-glow-md: 0 0 10px rgba(34, 197, 94, 0.6);
  --wstf-glow-lg: 0 0 20px rgba(34, 197, 94, 0.7);
  --wstf-glow-xl: 0 0 40px rgba(34, 197, 94, 0.8);
}

/* WSTF Brand Classes */
.wstf-bg-primary { background-color: var(--wstf-primary-500); }
.wstf-text-primary { color: var(--wstf-primary-500); }
.wstf-border-primary { border-color: var(--wstf-primary-500); }
.wstf-glow { box-shadow: var(--wstf-glow-md); }
.wstf-glow-lg { box-shadow: var(--wstf-glow-lg); }

/* Neon button styles */
.wstf-btn-primary {
  background: linear-gradient(135deg, var(--wstf-primary-500), var(--wstf-primary-600));
  color: white;
  border: 1px solid var(--wstf-primary-400);
  box-shadow: var(--wstf-glow-sm);
  transition: all 0.2s ease;
}

.wstf-btn-primary:hover {
  background: linear-gradient(135deg, var(--wstf-primary-400), var(--wstf-primary-500));
  box-shadow: var(--wstf-glow-md);
  transform: translateY(-1px);
}

/* Dark theme card */
.wstf-card-dark {
  background: linear-gradient(135deg, var(--wstf-dark-800), var(--wstf-dark-900));
  border: 1px solid var(--wstf-primary-900);
  box-shadow: var(--wstf-glow-sm);
}

/* Code block styling */
.wstf-code-block {
  background: var(--wstf-dark-950);
  border: 1px solid var(--wstf-primary-900);
  box-shadow: inset 0 0 10px rgba(34, 197, 94, 0.1);
}
`;

// Utility functions
export const getThemeColor = (colorPath: string): string => {
  const paths = colorPath.split('.');
  let current: any = wstfTheme.colors;

  for (const path of paths) {
    current = current[path];
    if (!current) return '#000000';
  }

  return current;
};

export const applyTheme = () => {
  if (typeof document !== 'undefined') {
    const style = document.createElement('style');
    style.textContent = wstfThemeCSS;
    document.head.appendChild(style);
  }
};