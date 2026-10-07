'use client';
import { useState } from 'react';
import type { Channel, ChannelSettings } from './lib/channel-preview';

function NumberField({ value, min, max, id, label, onCommit }: {
  value: number; min: number; max: number; id: string; label: string; onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft !== null && draft.trim() !== '' && Number.isFinite(Number(draft))) onCommit(draft);
    setDraft(null);
  };
  return <input id={id} aria-label={label} type="number" min={min} max={max} step="1"
    value={draft ?? value} onChange={event => setDraft(event.target.value)} onBlur={commit}
    onKeyDown={event => {
      if (event.key === 'Enter') { event.preventDefault(); commit(); }
      if (event.key === 'Escape') setDraft(null);
    }} />;
}

export default function ChannelControls({ channel, settings, limit, active, disabled, markerLabel, displayMaximum, onDisplayChange, onSelect, onChange, onAuto }: {
  channel: Channel; settings: ChannelSettings; limit: number; active: boolean; disabled: boolean; markerLabel: string;
  displayMaximum: number; onDisplayChange: (next: ChannelSettings) => void;
  onSelect: () => void; onChange: (next: ChannelSettings) => void; onAuto: () => void;
}) {
  const minimum = (value: string) => onChange({ ...settings, minimum: Math.max(0, Math.min(settings.maximum, Math.round(Number(value)))) });
  const maximum = (value: string) => onChange({ ...settings, maximum: Math.min(limit, Math.max(settings.minimum, Math.round(Number(value)))) });
  return <fieldset className={`channel-settings-card ${active ? 'active' : ''}`} disabled={disabled}>
    <legend className="sr-only">{channel} channel settings</legend>
    <button type="button" className="channel-settings-title" data-channel={channel} aria-pressed={active} onClick={onSelect}>{channel[0].toUpperCase() + channel.slice(1)}{active ? ' · selected' : ''}</button>
    {markerLabel && <span className="channel-marker">{markerLabel}</span>}
    <p className="channel-control-caption">Display range · appearance only</p>
    <div className="channel-threshold-pair">
      <label htmlFor={`${channel}-display-minimum`}>Display minimum
        <NumberField id={`${channel}-display-minimum`} label={`${channel} display minimum`} value={settings.displayMinimum ?? 0} min={0} max={(settings.displayMaximum ?? displayMaximum) - 1}
          onCommit={value => onDisplayChange({ ...settings, displayMinimum: Math.max(0, Math.min((settings.displayMaximum ?? displayMaximum) - 1, Math.round(Number(value)))) })} />
      </label>
      <label htmlFor={`${channel}-display-maximum`}>Display maximum
        <NumberField id={`${channel}-display-maximum`} label={`${channel} display maximum`} value={settings.displayMaximum ?? displayMaximum} min={(settings.displayMinimum ?? 0) + 1} max={limit}
          onCommit={value => onDisplayChange({ ...settings, displayMaximum: Math.min(limit, Math.max((settings.displayMinimum ?? 0) + 1, Math.round(Number(value)))) })} />
      </label>
    </div>
    <p className="channel-control-caption">Detection thresholds · pixels counted</p>
    <div className="channel-threshold-pair">
      <label htmlFor={`${channel}-minimum`}>Minimum
        <NumberField id={`${channel}-minimum`} label={`${channel} minimum threshold`} min={0} max={settings.maximum} value={settings.minimum} onCommit={minimum} />
        <input aria-label={`${channel} minimum threshold slider`} type="range" min="0" max={limit} step="1" value={settings.minimum} onChange={(event) => minimum(event.target.value)} />
      </label>
      <label htmlFor={`${channel}-maximum`}>Maximum
        <NumberField id={`${channel}-maximum`} label={`${channel} maximum threshold`} min={settings.minimum} max={limit} value={settings.maximum} onCommit={maximum} />
        <input aria-label={`${channel} maximum threshold slider`} type="range" min="0" max={limit} step="1" value={settings.maximum} onChange={(event) => maximum(event.target.value)} />
      </label>
    </div>
    <label className="channel-brightness-label" htmlFor={`${channel}-brightness`}>Brightness <span>{settings.brightness.toFixed(1)}×</span>
      <input id={`${channel}-brightness`} aria-label={`${channel} brightness`} type="range" min="0.2" max="3" step="0.1" value={settings.brightness} onChange={(event) => onDisplayChange({ ...settings, brightness: Number(event.target.value) })} />
    </label>
    <div className="channel-settings-footer"><span>Range: 0–{limit}</span><button type="button" onClick={onAuto} aria-label={`Auto ${channel} settings`}>Auto</button></div>
  </fieldset>;
}
