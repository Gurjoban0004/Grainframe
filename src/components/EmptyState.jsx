import { getLastPhoto } from '../utils/lastPhoto.js';
import '../styles/EmptyState.css';

export default function EmptyState() {
  const lastPhotoUrl = getLastPhoto();

  return (
    <div className="empty-state">
      {lastPhotoUrl && (
        <img
          src={lastPhotoUrl}
          className="empty-state-bg"
          alt=""
          loading="eager"
        />
      )}

      <div className="film-frame-container">
        <div className="sprocket-row">
          <div className="sprocket-hole" />
          <div className="sprocket-hole" />
          <div className="sprocket-hole" />
          <div className="sprocket-hole" />
          <div className="sprocket-hole" />
          <div className="sprocket-hole" />
        </div>

        <div className="film-gate">
          <div className="film-gate-border" />
          <span className="frame-number">00</span>
        </div>

        <div className="sprocket-row">
          <div className="sprocket-hole" />
          <div className="sprocket-hole" />
          <div className="sprocket-hole" />
          <div className="sprocket-hole" />
          <div className="sprocket-hole" />
          <div className="sprocket-hole" />
        </div>

        <span className="film-type-text">GRAINFRAME 400</span>
      </div>

      <div className="empty-state-branding">
        <span className="empty-state-title">grainframe</span>
        <span className="empty-state-subtitle">tap to capture or import</span>
      </div>
    </div>
  );
}
