import { useId } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { CategoryTotal, CumulativePoint, MonthlyPoint } from '../domain/calculations';
import { formatMoney, formatPercent } from '../domain/money';
import { formatCount } from '../domain/format';

interface TooltipItem {
  name?: string | number;
  value?: number | string;
  color?: string;
  dataKey?: string | number;
  payload?: Record<string, unknown>;
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipItem[];
  label?: string | number;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="chart-tooltip">
      {label !== undefined && <div className="chart-tooltip-title">{String(label)}</div>}
      {payload.map((item, index) => {
        const value = typeof item.value === 'number' ? item.value : Number(item.value);
        const color =
          typeof item.payload?.fill === 'string'
            ? item.payload.fill
            : item.color ?? 'var(--accent)';
        return (
          <div className="chart-tooltip-row" key={`${item.name ?? index}-${index}`}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span
                aria-hidden="true"
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  background: color,
                  display: 'inline-block',
                }}
              />
              {String(item.name ?? '')}
            </span>
            <strong>{formatMoney(Number.isFinite(value) ? value : 0).replace(/\u00a0|\u202f/g, ' ')}</strong>
          </div>
        );
      })}
    </div>
  );
}

function axisAmount(value: number): string {
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1).replace('.', ',')} Md`;
  if (absolute >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace('.', ',')} M`;
  if (absolute >= 1_000) return `${Math.round(value / 1_000)} k`;
  return String(value);
}

export function MonthlyBarChart({
  data,
  ariaLabel,
  height = 280,
}: {
  data: MonthlyPoint[];
  ariaLabel: string;
  height?: number;
}) {
  return (
    <div className="chart-box" style={{ height }} role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 6, left: 0, bottom: 0 }} barGap={3}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--chart-grid)" />
          <XAxis
            dataKey="shortLabel"
            tickLine={false}
            axisLine={{ stroke: 'var(--chart-grid)' }}
            tick={{ fill: 'var(--muted)', fontSize: 11 }}
            interval={0}
            minTickGap={4}
          />
          <YAxis
            tickFormatter={axisAmount}
            tickLine={false}
            axisLine={false}
            tick={{ fill: 'var(--muted)', fontSize: 11 }}
            width={52}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--surface-muted)' }} />
          <Bar
            dataKey="income"
            name="Revenus"
            fill="var(--income)"
            radius={[4, 4, 0, 0]}
            maxBarSize={22}
          />
          <Bar
            dataKey="expense"
            name="Dépenses"
            fill="var(--expense)"
            radius={[4, 4, 0, 0]}
            maxBarSize={22}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BalanceAreaChart({
  points,
  ariaLabel,
  height = 260,
}: {
  points: CumulativePoint[];
  ariaLabel: string;
  height?: number;
}) {
  const rawId = useId();
  const gradientId = `balance-${rawId.replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <div className="chart-box" style={{ height }} role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.28} />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--chart-grid)" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={{ stroke: 'var(--chart-grid)' }}
            tick={{ fill: 'var(--muted)', fontSize: 10 }}
            minTickGap={18}
            interval="preserveStartEnd"
          />
          <YAxis
            tickFormatter={axisAmount}
            tickLine={false}
            axisLine={false}
            tick={{ fill: 'var(--muted)', fontSize: 11 }}
            width={52}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'var(--border-strong)' }} />
          <Area
            type="monotone"
            dataKey="balance"
            name="Solde cumulé"
            stroke="var(--accent)"
            strokeWidth={2.2}
            fill={`url(#${gradientId})`}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ExpenseDonut({
  rows,
  total,
  ariaLabel,
  height = 240,
}: {
  rows: CategoryTotal[];
  total: number;
  ariaLabel: string;
  height?: number;
}) {
  const nonZero = rows.filter((row) => row.amount > 0);
  const top = nonZero.slice(0, 6);
  const rest = nonZero.slice(6);
  const slices = [...top];
  if (rest.length > 0) {
    slices.push({
      categoryId: '__rest__',
      name: `Autres (${rest.length})`,
      type: 'expense',
      color: 'var(--muted)',
      icon: 'more',
      amount: rest.reduce((sum, row) => sum + row.amount, 0),
      count: rest.reduce((sum, row) => sum + row.count, 0),
      share:
        total > 0
          ? Math.round((rest.reduce((sum, row) => sum + row.amount, 0) / total) * 10000) / 100
          : null,
    });
  }

  return (
    <div>
      <div style={{ position: 'relative', height }} role="img" aria-label={ariaLabel}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="amount"
              nameKey="name"
              innerRadius="62%"
              outerRadius="88%"
              paddingAngle={2}
              stroke="var(--surface)"
              strokeWidth={2}
              isAnimationActive={false}
            >
              {slices.map((row) => (
                <Cell key={row.categoryId} fill={row.color} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            pointerEvents: 'none',
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)' }}>
              Total dépenses
            </div>
            <div style={{ fontSize: 17, fontWeight: 650, fontVariantNumeric: 'tabular-nums' }}>
              {formatMoney(total).replace(/\u00a0|\u202f/g, ' ')}
            </div>
          </div>
        </div>
      </div>
      {slices.length > 0 && (
        <ul className="chart-legend" style={{ listStyle: 'none', padding: 0 }}>
          {slices.map((row) => (
            <li className="chart-legend-item" key={row.categoryId}>
              <span className="category-dot" style={{ background: row.color }} />
              <span>{row.name}</span>
              <span className="muted">·</span>
              <strong>{formatPercent(row.share)}</strong>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function MiniBarList({
  rows,
  emptyLabel = 'Aucune dépense sur cette période.',
}: {
  rows: CategoryTotal[];
  emptyLabel?: string;
}) {
  const top = rows.filter((row) => row.amount > 0).slice(0, 6);
  const max = Math.max(1, ...top.map((row) => row.amount));
  if (top.length === 0) {
    return <p className="muted small">{emptyLabel}</p>;
  }
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 11 }}>
      {top.map((row) => (
        <li key={row.categoryId}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12.5, marginBottom: 4 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
              <span className="category-dot" style={{ background: row.color }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {row.name}
              </span>
            </span>
            <span className="num" style={{ whiteSpace: 'nowrap' }}>
              {formatMoney(row.amount).replace(/\u00a0|\u202f/g, ' ')}
            </span>
          </div>
          <div className="progress" aria-hidden="true" style={{ height: 5 }}>
            <span
              style={{
                width: `${(row.amount / max) * 100}%`,
                background: row.color,
              }}
            />
          </div>
          <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>
            {formatCount(row.count)} opération{row.count > 1 ? 's' : ''} · {formatPercent(row.share)} des dépenses
          </div>
        </li>
      ))}
    </ul>
  );
}
