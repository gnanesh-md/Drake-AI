import React from 'react';
import './GraphLoadingSpinner.css';
import oilfieldLoading from '../../assets/oil_refinery_loading_animation.svg';

const GraphLoadingSpinner = () => (
  <div className="graph-loading-spinner" aria-label="Loading">
    <div className="oil-loader">
      <object data={oilfieldLoading} type="image/svg+xml" aria-label="Loading animation" className="oil-loader-image" />
    </div>
  </div>
);

export default GraphLoadingSpinner;
