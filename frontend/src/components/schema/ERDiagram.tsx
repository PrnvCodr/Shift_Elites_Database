import { useEffect, useMemo, useCallback, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Node,
  Edge,
  Position,
  Handle,
  NodeProps,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useSchemaStore } from '../../stores';
import { Share2, RefreshCw, ZoomIn, Maximize2 } from 'lucide-react';

// Custom table node
function TableNode({ data, selected }: NodeProps) {
  return (
    <div
      style={{
        minWidth: '220px',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
        border: selected ? '2px solid var(--accent-primary)' : '1px solid var(--border-secondary)',
        boxShadow: selected ? 'var(--accent-glow)' : 'var(--shadow-md)',
        background: 'var(--bg-secondary)',
        transition: 'all var(--transition-fast)',
      }}
    >
      {/* Header */}
      <div
        style={{
          background: 'var(--accent-gradient)',
          padding: '8px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}
      >
        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'white' }}>
          {(data as any).label}
        </span>
        {(data as any).rowCount !== undefined && (
          <span style={{
            fontSize: '0.6rem', background: 'rgba(255,255,255,0.2)',
            padding: '1px 6px', borderRadius: '4px', color: 'white',
            marginLeft: 'auto',
          }}>
            {(data as any).rowCount} rows
          </span>
        )}
      </div>

      {/* Columns */}
      <div style={{ padding: '4px 0' }}>
        {(data as any).columns?.map((col: any, i: number) => (
          <div
            key={i}
            style={{
              padding: '4px 12px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '0.75rem',
              borderBottom: i < (data as any).columns.length - 1 ? '1px solid var(--border-secondary)' : 'none',
              position: 'relative',
            }}
          >
            <Handle
              type="target"
              position={Position.Left}
              id={`${col.name}-target`}
              style={{
                width: 6, height: 6,
                background: col.primaryKey ? '#fbbf24' : 'var(--accent-primary)',
                border: 'none',
                left: -3,
              }}
            />
            {col.primaryKey && (
              <span style={{ color: '#fbbf24', fontSize: '0.65rem', fontWeight: 700 }}>PK</span>
            )}
            {col.foreignKey && (
              <span style={{ color: '#60a5fa', fontSize: '0.65rem', fontWeight: 700 }}>FK</span>
            )}
            <span style={{
              flex: 1,
              color: col.primaryKey ? '#fbbf24' : 'var(--text-primary)',
              fontWeight: col.primaryKey ? 600 : 400,
              fontFamily: 'var(--font-code)',
            }}>
              {col.name}
            </span>
            <span style={{
              fontSize: '0.65rem',
              color: 'var(--text-muted)',
              fontFamily: 'var(--font-code)',
            }}>
              {col.type}
            </span>
            <Handle
              type="source"
              position={Position.Right}
              id={`${col.name}-source`}
              style={{
                width: 6, height: 6,
                background: col.primaryKey ? '#fbbf24' : 'var(--accent-primary)',
                border: 'none',
                right: -3,
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

const nodeTypes = { tableNode: TableNode };

export function ERDiagram() {
  const { tables, fetchSchema, isLoading } = useSchemaStore();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  useEffect(() => {
    if (tables.length === 0) fetchSchema();
  }, []);

  // Detect foreign keys by naming convention (e.g., customer_id → customers.id)
  const detectRelationships = useCallback((tables: any[]) => {
    const relationships: { from: string; fromCol: string; to: string; toCol: string }[] = [];
    const tableNames = new Set(tables.map(t => t.name));

    for (const table of tables) {
      for (const col of (table.columns || [])) {
        const colName = col.name.toLowerCase();
        if (colName.endsWith('_id') && !col.primaryKey) {
          const refTableName = colName.slice(0, -3) + 's'; // e.g., customer_id → customers
          const refTableNameSingular = colName.slice(0, -3); // e.g., customer_id → customer
          
          let refTable = '';
          if (tableNames.has(refTableName)) refTable = refTableName;
          else if (tableNames.has(refTableNameSingular)) refTable = refTableNameSingular;
          
          if (refTable) {
            relationships.push({
              from: table.name,
              fromCol: col.name,
              to: refTable,
              toCol: 'id',
            });
          }
        }
      }
    }
    return relationships;
  }, []);

  useEffect(() => {
    if (tables.length === 0) return;

    const relationships = detectRelationships(tables);

    // Position tables in a grid
    const cols = Math.ceil(Math.sqrt(tables.length));
    const xSpacing = 320;
    const ySpacing = 280;

    const newNodes: Node[] = tables.map((table, i) => {
      const row = Math.floor(i / cols);
      const col = i % cols;

      // Annotate FK columns
      const annotatedCols = table.columns?.map((c: any) => ({
        ...c,
        foreignKey: relationships.some(r => r.from === table.name && r.fromCol === c.name),
      }));

      return {
        id: table.name,
        type: 'tableNode',
        position: { x: col * xSpacing + 50, y: row * ySpacing + 50 },
        data: {
          label: table.name,
          columns: annotatedCols || [],
          rowCount: table.rowCount,
        },
      };
    });

    const newEdges: Edge[] = relationships.map((rel, i) => ({
      id: `edge-${i}`,
      source: rel.from,
      target: rel.to,
      sourceHandle: `${rel.fromCol}-source`,
      targetHandle: `${rel.toCol}-target`,
      animated: true,
      style: { stroke: 'var(--accent-primary)', strokeWidth: 2 },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: 'var(--accent-primary)',
      },
      label: `${rel.fromCol} → ${rel.toCol}`,
      labelStyle: {
        fontSize: '0.6rem',
        fill: 'var(--text-muted)',
        fontFamily: 'var(--font-code)',
      },
      labelBgStyle: {
        fill: 'var(--bg-secondary)',
        fillOpacity: 0.9,
      },
    }));

    setNodes(newNodes);
    setEdges(newEdges);
  }, [tables]);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{
        padding: '10px 16px',
        borderBottom: '1px solid var(--border-secondary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'var(--bg-secondary)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Share2 size={16} style={{ color: 'var(--accent-primary)' }} />
          <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Entity Relationship Diagram</span>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            {tables.length} table{tables.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button className="btn btn-ghost" style={{ fontSize: '0.72rem' }} onClick={() => fetchSchema()}>
            <RefreshCw size={12} /> Refresh
          </button>
        </div>
      </div>

      {/* Diagram */}
      <div style={{ flex: 1 }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
          minZoom={0.3}
          maxZoom={2}
          defaultEdgeOptions={{
            animated: true,
            style: { strokeWidth: 2 },
          }}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="var(--border-secondary)" gap={20} size={1} />
          <Controls
            style={{
              background: 'var(--bg-secondary)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-secondary)',
            }}
          />
          <MiniMap
            nodeStrokeColor="var(--accent-primary)"
            nodeColor="var(--bg-tertiary)"
            maskColor="rgba(0,0,0,0.6)"
            style={{
              background: 'var(--bg-secondary)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-secondary)',
            }}
          />
        </ReactFlow>
      </div>
    </div>
  );
}
