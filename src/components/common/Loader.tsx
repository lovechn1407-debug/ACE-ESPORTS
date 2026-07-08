import React from 'react';

interface LoaderProps {
  fullPage?: boolean;
}

const Loader: React.FC<LoaderProps> = ({ fullPage = false }) => {
  const content = (
    <div className="d-flex flex-column align-items-center justify-content-center" style={{ minHeight: fullPage ? '100vh' : '200px' }}>
      <div className="spinner-border text-warning" role="status" style={{ width: '3rem', height: '3rem' }}>
        <span className="visually-hidden">Loading...</span>
      </div>
      <p className="text-secondary mt-3 font-monospace small uppercase tracking-wider" style={{ letterSpacing: '0.1em' }}>Loading Esports App...</p>
    </div>
  );

  if (fullPage) {
    return (
      <div 
        className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center" 
        style={{ 
          zIndex: 9999, 
          background: 'rgba(11, 15, 25, 0.9)', 
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)'
        }}
      >
        {content}
      </div>
    );
  }

  return content;
};

export default Loader;
