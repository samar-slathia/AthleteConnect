import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface NoticeBannerProps {
  message?: string;
}

export const NoticeBanner: React.FC<NoticeBannerProps> = ({
  message = 'Phase 1 Preview Notice: Authentication and live data are not yet implemented. This dashboard is a foundation preview for layout and workflow review only. Server-side security and authorization will be introduced in a later phase.'
}) => {
  return (
    <div className="notice-banner" role="alert">
      <AlertTriangle size={20} aria-hidden="true" />
      <div>
        <div className="notice-title">Foundation Preview Only</div>
        <div className="notice-desc">{message}</div>
      </div>
    </div>
  );
};
