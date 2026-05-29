import React from 'react';
import './GraphLoadingSpinner.css';
import oilfieldLoading from '../../assets/oilfield-loading.png';

const GraphLoadingSpinner = () => (
  <div className="graph-loading-spinner" aria-label="Loading">
    <div className="oil-loader">
      <img src={oilfieldLoading} alt="" className="oil-loader-image" />
      <div className="oil-loader-orbit">
        <span className="oil-loader-dot" />
      </div>
      <div className="oil-loader-sweep" />
    </div>
  </div>
);

export default GraphLoadingSpinner;
