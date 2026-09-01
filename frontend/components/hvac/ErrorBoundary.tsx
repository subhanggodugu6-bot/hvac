'use client';

import React from 'react';

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="kpi-tile border border-rose-500/30 text-sm">
          <div className="text-rose-800 font-semibold">DATA SOURCE ERROR</div>
          <p className="text-slate-400 mt-2">{this.state.error.message}</p>
          <button className="btn-ghost mt-3" onClick={() => this.setState({ error: null })}>
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
