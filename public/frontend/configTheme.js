
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          fontFamily: { sans: ['Inter', 'sans-serif'] },
          colors: {
            brand: {
              bg: '#050505',       
              sidebar: '#0a0a0a',  
              panel: '#111111',    
              purple: '#8b5cf6',   
              purpleDark: '#7c3aed',
              border: '#27272a',   
              input: '#18181b',    
              bubble: '#27272a'    
            }
          },
          animation: { 'fade-in': 'fadeIn 0.3s ease-out', 'pulse-slow': 'pulse 3s infinite' },
          keyframes: { fadeIn: { '0%': { opacity: '0', transform: 'translateY(5px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } } }
        }
      }
    }
