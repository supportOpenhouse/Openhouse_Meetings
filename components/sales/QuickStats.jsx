'use client';

import { CalendarCheck, TrendingUp, BarChart3, Users } from 'lucide-react';

// 4-card stat grid for the sales home. Reuses the shared sx-stats / sx-stat
// classes (colored .ico chips) so it matches the rest of the FCP surface.
export default function QuickStats({ stats }) {
  const s = stats || {};
  return (
    <div className="sx-stats" style={{ marginTop: 20 }}>
      <div className="sx-stat">
        <div className="ico">
          <CalendarCheck size={17} />
        </div>
        <div className="v">{s.today || 0}</div>
        <div className="l">Today’s visits</div>
      </div>
      <div className="sx-stat">
        <div className="ico amber">
          <TrendingUp size={17} />
        </div>
        <div className="v">{s.week || 0}</div>
        <div className="l">This week</div>
      </div>
      <div className="sx-stat">
        <div className="ico">
          <BarChart3 size={17} />
        </div>
        <div className="v">{s.total || 0}</div>
        <div className="l">All visits</div>
      </div>
      <div className="sx-stat">
        <div className="ico green">
          <Users size={17} />
        </div>
        <div className="v">{s.cps || 0}</div>
        <div className="l">Partners</div>
      </div>
    </div>
  );
}
