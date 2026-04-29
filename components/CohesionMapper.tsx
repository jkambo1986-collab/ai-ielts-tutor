/**
 * @file A component to visualize the logical structure of an essay as an interactive map.
 * It renders nodes (ideas) and links (transitions) and provides detailed AI analysis on click.
 */

import React, { useMemo, useState } from 'react';
import { CohesionMap, CohesionNode, CohesionLink } from '../types';

interface CohesionMapperProps {
  data: CohesionMap;
}

// A discriminated union to represent the currently selected element (either a node or a link).
type SelectedElement = {
    type: 'node';
    data: CohesionNode;
} | {
    type: 'link';
    data: CohesionLink;
} | null;

// Constants for layout
const SVG_WIDTH = 800;
const SVG_HEIGHT = 600;
const NODE_RADIUS = 8;
const LEVEL_HEIGHT = 120;
const THESIS_Y = 60;
const MAIN_POINT_Y = THESIS_Y + LEVEL_HEIGHT;
const SUPPORTING_POINT_Y_START = MAIN_POINT_Y + LEVEL_HEIGHT;

const CohesionMapper: React.FC<CohesionMapperProps> = ({ data }) => {
  const [selectedElement, setSelectedElement] = useState<SelectedElement>(null);

  // Calculate node positions based on a simple hierarchical layout.
  const layout = useMemo(() => {
    const positions = new Map<string, { x: number; y: number }>();
    const thesisNode = data.nodes.find(n => n.type === 'thesis');
    const mainPointNodes = data.nodes.filter(n => n.type === 'mainPoint');
    
    // Position thesis node at the top center.
    if (thesisNode) {
      positions.set(thesisNode.id, { x: SVG_WIDTH / 2, y: THESIS_Y });
    }

    // Position main point nodes evenly below the thesis.
    mainPointNodes.forEach((mpNode, index) => {
      const x = (SVG_WIDTH / (mainPointNodes.length + 1)) * (index + 1);
      positions.set(mpNode.id, { x, y: MAIN_POINT_Y });

      // Position supporting points below their respective main point.
      const supportingNodes = data.nodes.filter(n => n.type === 'supportingPoint' && data.links.some(l => l.source === mpNode.id && l.target === n.id));
      supportingNodes.forEach((spNode, spIndex) => {
          const spX = x + (spIndex - (supportingNodes.length -1) / 2) * 80; // Stagger them horizontally
          positions.set(spNode.id, { x: spX, y: SUPPORTING_POINT_Y_START + spIndex * 40 });
      });
    });

    return positions;
  }, [data]);

  // Define styles for different link strengths.
  const linkStyles = {
    strong: { stroke: '#10B981', strokeDasharray: 'none' }, // green-500
    weak: { stroke: '#F59E0B', strokeDasharray: '5, 5' }, // amber-500
    missing: { stroke: '#EF4444', strokeDasharray: '3, 3' }, // red-500
  };
  
  // Define styles for different node types.
  const nodeStyles = {
    thesis: { fill: '#3B82F6' }, // blue-500
    mainPoint: { fill: '#8B5CF6' }, // violet-500
    supportingPoint: { fill: '#64748B' }, // slate-500
  }

  const handleSelectNode = (node: CohesionNode) => {
    setSelectedElement({ type: 'node', data: node });
  };

  const handleSelectLink = (link: CohesionLink) => {
    setSelectedElement({ type: 'link', data: link });
  };


  return (
    <div className="flex flex-col md:flex-row gap-6">
      <div className="flex-grow bg-slate-100 dark:bg-slate-900/50 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 relative">
        <svg viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`} className="w-full h-auto" aria-labelledby="map-title" role="graphics-document">
            <title id="map-title">Essay Cohesion Map</title>
            <defs>
                <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#94A3B8" />
                </marker>
            </defs>
          {/* Render links */}
          {data.links.map((link, i) => {
            const sourcePos = layout.get(link.source);
            const targetPos = layout.get(link.target);
            const sourceNode = data.nodes.find(n => n.id === link.source);
            const targetNode = data.nodes.find(n => n.id === link.target);
            if (!sourcePos || !targetPos) return null;

            return (
                <g
                    key={i}
                    role="button"
                    tabIndex={0}
                    aria-label={`Link from ${sourceNode?.text || 'start'} to ${targetNode?.text || 'end'}, strength: ${link.strength}`}
                    onClick={() => handleSelectLink(link)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSelectLink(link); } }}
                    className="focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 rounded-sm"
                >
                    {/* Invisible thicker line for easier clicking/focus area */}
                    <line
                        x1={sourcePos.x} y1={sourcePos.y}
                        x2={targetPos.x} y2={targetPos.y}
                        stroke="transparent"
                        strokeWidth="12"
                    />
                    {/* Visible line */}
                    <line
                        x1={sourcePos.x} y1={sourcePos.y}
                        x2={targetPos.x} y2={targetPos.y}
                        stroke={linkStyles[link.strength].stroke}
                        strokeDasharray={linkStyles[link.strength].strokeDasharray}
                        strokeWidth="2"
                        className="pointer-events-none"
                        markerEnd="url(#arrow)"
                    />
              </g>
            );
          })}

          {/* Render nodes */}
          {data.nodes.map(node => {
            const pos = layout.get(node.id);
            if (!pos) return null;
            const isSelected = selectedElement?.type === 'node' && selectedElement.data.id === node.id;

            return (
                <g 
                    key={node.id} 
                    transform={`translate(${pos.x}, ${pos.y})`} 
                    className="cursor-pointer group focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 rounded-full" 
                    onClick={() => handleSelectNode(node)} 
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSelectNode(node); } }}
                    role="button"
                    tabIndex={0}
                    aria-label={`Node: ${node.type}, summary: ${node.text}`}
                >
                    <circle
                        cx="0"
                        cy="0"
                        r={NODE_RADIUS}
                        fill={nodeStyles[node.type].fill}
                        stroke="#fff"
                        strokeWidth={isSelected ? "3" : "1.5"}
                        className={isSelected ? "stroke-blue-400" : "group-hover:stroke-blue-300"}
                    />
                    <text x="0" y={-NODE_RADIUS - 5} textAnchor="middle" className="text-xs fill-slate-700 dark:fill-slate-300 font-medium select-none pointer-events-none">
                        {node.text.length > 20 ? node.text.substring(0, 18) + '...' : node.text}
                    </text>
              </g>
            );
          })}
        </svg>
         <div className="absolute bottom-2 left-2 flex gap-4 text-xs">
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-blue-500"></div>Thesis</div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-violet-500"></div>Main Point</div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-slate-500"></div>Support</div>
        </div>
      </div>
      <div className="w-full md:w-96 flex-shrink-0 bg-white dark:bg-slate-800 p-4 rounded-lg border border-slate-200 dark:border-slate-700">
        <h3 className="font-bold text-lg mb-4">Analysis Details</h3>
        {!selectedElement && (
          <div className="text-center text-slate-500 py-10">
            Click on a node (circle) or a link (line) to see the AI's analysis.
          </div>
        )}
        {selectedElement?.type === 'node' && (
          <div className="space-y-3">
            <h4 className="font-semibold text-blue-600 dark:text-blue-400 capitalize">{selectedElement.data.type.replace(/([A-Z])/g, ' $1')}</h4>
            <div>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Summary:</p>
              <p className="italic text-slate-700 dark:text-slate-300">"{selectedElement.data.text}"</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Original Sentence:</p>
              <p className="text-slate-700 dark:text-slate-300">"{selectedElement.data.originalSentence}"</p>
            </div>
          </div>
        )}
        {selectedElement?.type === 'link' && (
          <div className="space-y-3">
            <h4 className="font-semibold" style={{ color: linkStyles[selectedElement.data.strength].stroke }}>
              {selectedElement.data.strength.charAt(0).toUpperCase() + selectedElement.data.strength.slice(1)} Connection
            </h4>
            {selectedElement.data.linkingPhrase && (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                <strong>Linking Phrase Used:</strong> "{selectedElement.data.linkingPhrase}"
              </p>
            )}
            <div>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">AI Analysis:</p>
              <p className="text-slate-700 dark:text-slate-300">{selectedElement.data.explanation}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CohesionMapper;
