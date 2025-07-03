## Available Commands

```bash
npm run build      # ✅ Production build (fast, tested!)
npm run dev        # ✅ Development build (single run, see tip for watch mode)
# For watch mode:  npx esbuild src/ui/ui.js --bundle --outfile=dist/ui.js --watch
npm run lint       # ✅ ESLint checking
npm run lint:fix   # ✅ ESLint auto-fix
npm run clean      # ✅ Clean dist folder
```

## Development Loop

```bash
# 1. Start coding session
npm run build      # or use esbuild --watch for live updates

# 2. Code, save, see auto-rebuild messages (if using watch)
# 3. Test in Figma
# 4. Repeat steps 2-3

# 5. When ready to commit:
npm run build            # Clean production build
npm run lint             # Check code quality
git add .                # Stage changes
git commit -m "message"  # Commit
git push                 # Push to repository
```


















# State Machine Plugin - Development Notes

## Project Overview
**Figma Plugin ID**: 1522310270574771660  
**Plugin Name**: State machine  
**Last Updated**: 2024-12-19 - Code Restructuring Complete

## Purpose & Goals
This Figma plugin enables designers to create dynamic state transitions between component variants without manual prototyping. The plugin automatically detects component variants and creates interactive state management systems using Figma variables and prototype reactions.

**Key Use Cases:**
- Interactive UI components (buttons, cards, modals)
- Multi-state component systems (loading, error, success states)
- Conditional state changes based on other component states
- Complex interaction flows with multiple decision points

## Architecture Overview

### Core Components
1. **Main Plugin (`code.ts`)** - Backend logic running in Figma's plugin environment
2. **UI Interface (`ui.html`)** - Frontend web interface for user interaction
3. **State Management** - Figma variables and prototype reactions system

### How It Works

#### 1. Selection Analysis
- User selects a component instance containing nested variant components
- Plugin traverses the selection tree to find all `InstanceNode` types
- Groups instances by their parent component/component-set for variant management

#### 2. Component Detection
- Identifies component variants by checking for `ComponentSetNode` parents
- Extracts available states from `componentPropertyDefinitions`
- Maps variant properties (e.g., "State" with values: "Default", "Hover", "Active")

#### 3. Variable Creation
- Creates a Figma variable collection named "state-machine"
- Generates boolean variables for interaction triggers
- Creates string variables for state management per component instance

#### 4. Interaction Setup
- **Primary Action**: Defines what happens when the component is clicked
- **Conditional Rules**: Define state changes for other instances based on conditions
- Applies prototype reactions to component instances

### Key Features

#### Variable Management
- Automatic cleanup of orphaned variables
- Persistent storage of interaction data using `figma.clientStorage`
- Support for multiple concurrent state machines

#### Interaction Types
- **Direct State Change**: Click → Change to specific state
- **Conditional Logic**: If [condition] then [action]
- **Reset Functionality**: Return to initial state option

#### Error Handling
- Validates user selection (must be single component instance)
- Checks for nested variant components
- Handles missing component definitions gracefully

## Current State & Recent Work

### Last Session Focus
- ✅ **COMPLETED**: Code restructuring with esbuild
- ✅ **COMPLETED**: Split monolithic code.ts into logical modules
- ✅ **COMPLETED**: Extracted CSS and JS from ui.html 
- ✅ **COMPLETED**: esbuild build system with proper development workflow
- ✅ **COMPLETED**: Modular architecture with proper separation of concerns

### Working Features
✅ Component instance detection  
✅ Variant property extraction  
✅ Variable collection management  
✅ Basic interaction creation  
✅ Data persistence with client storage  
✅ Cleanup functionality for orphaned variables  
✅ **NEW**: Modular code architecture with esbuild bundling
✅ **NEW**: External CSS files with proper esbuild copying for Figma compatibility
✅ **NEW**: Development workflow with fast builds
✅ **NEW**: Production builds with minification

### Known Limitations
- Only supports VARIANT type component properties
- Requires manual selection of parent component containing variants
- No support for complex nested component hierarchies
- Limited to boolean and string variable types

## Technical Implementation

### Key Functions
- `findNestedInstances()` - Recursively finds all component instances
- `groupInstancesByComponent()` - Groups instances by their parent component
- `createInteraction()` - Creates variables and applies prototype reactions
- `performComprehensiveCleanup()` - Removes orphaned variables and data

### Data Structures
```typescript
interface ComponentInfo {
  id: string;
  name: string;
  instances: InstanceNode[];
  states: string[];
  properties: { [key: string]: string[] };
}

interface Interaction {
  id: string;
  component: string;
  primaryAction: string;
  conditionalRules: ConditionalRule[];
}
```

### Storage Strategy
- Uses `figma.clientStorage` for persistent interaction data
- Storage key pattern: `interaction_{componentId}`
- JSON serialization for complex data structures

## Development Environment
- **TypeScript**: ^5.3.2
- **Build Tool**: esbuild (no webpack)
- **Bundling**: CSS and JS output to separate files in `dist/`
- **Linting**: ESLint with Figma plugin rules
- **Target**: Figma Plugin API v1.0.0



## Project Structure

```
src/
├── plugin/              # Backend plugin code
│   ├── main.ts         # Main entry point
│   ├── types.ts        # TypeScript interfaces
│   ├── constants.ts    # Plugin constants
│   ├── utils.ts        # Utility functions
│   ├── component-analyzer.ts  # Component detection
│   ├── variable-manager.ts    # Variable management
│   ├── interaction-manager.ts # Interaction logic
│   └── storage.ts      # Client storage
├── ui/                 # Frontend UI code
│   ├── ui.js           # UI JavaScript (imports CSS)
│   ├── ui.css          # UI styles (copied to dist)
│   └── ui.html         # HTML template with CSS link

dist/                   # Build output (gitignored)
├── code.js            # Bundled plugin code
├── ui.js              # Bundled UI JavaScript
├── ui.css             # Copied CSS file
└── ui.html            # Generated UI HTML with script reference
```

## Next Steps & Future Enhancements
1. Support for more complex component hierarchies
2. Visual state flow diagram in UI
3. Export/import of state machine configurations
4. Performance optimization for large component sets
5. Integration with Figma's Dev Mode for code generation

## Debug Information
- Plugin uses `DEBUG_INSTANCE_INDEX = 16` for targeted debugging
- Comprehensive logging throughout the codebase
- Error boundaries for graceful failure handling
- esbuild source maps enabled for debugging

---
*This file is automatically ignored by git and should be updated with each development session.* 