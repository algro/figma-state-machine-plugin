console.log('UI JS loaded: version test');
// State Machine Plugin UI JavaScript
import './ui.css';

// Constants
const RESET_TO_INITIAL = 'RESET_TO_INITIAL';

// Global state
let componentData = [];
let selectedComponent = null;
let existingInteractions = {}; // Store existing interactions data
let currentInteraction = {
  component: '',
  primaryAction: '',
  conditionalRules: []
};

// Initialize UI
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  // Send message to plugin that UI is loaded
  parent.postMessage({ pluginMessage: { type: 'init' } }, '*');
});

// Setup event listeners
function setupEventListeners() {
  // Component list selection
  document.getElementById('component-list')?.addEventListener('click', (e) => {
    const item = e.target.closest('.component-item');
    if (item) {
      selectComponent(item.dataset.componentId);
    }
  });

  // Primary action selection
  document.getElementById('primary-action')?.addEventListener('change', (e) => {
    currentInteraction.primaryAction = e.target.value;
    updateRulePreview();
  });

  // Add conditional rule button
  document.getElementById('add-rule')?.addEventListener('click', addConditionalRule);

  // Create interaction button
  document.getElementById('create-interaction')?.addEventListener('click', createInteraction);

  // Cancel button
  document.getElementById('cancel')?.addEventListener('click', () => {
    parent.postMessage({ pluginMessage: { type: 'cancel' } }, '*');
  });
}

// Add conditional rule function
function addConditionalRule() {
  console.log('addConditionalRule called');
  const ruleId = Date.now();
  const newRule = {
    id: ruleId,
    condition: '',
    action: ''
  };
  
  currentInteraction.conditionalRules.push(newRule);
  renderConditionalRules();
  updateRulePreview();
}

// Create interaction function
function createInteraction() {
  console.log('createInteraction called');
  if (!currentInteraction.component || !currentInteraction.primaryAction) {
    showStatus('Please select a component and primary action', 'error');
    return;
  }
  
  const interactionData = {
    id: `${currentInteraction.component}_${Date.now()}`,
    component: currentInteraction.component,
    primaryAction: currentInteraction.primaryAction,
    conditionalRules: currentInteraction.conditionalRules
  };
  
  parent.postMessage({ 
    pluginMessage: { 
      type: 'create-interaction', 
      data: interactionData 
    } 
  }, '*');
}

// Update rule preview function
function updateRulePreview() {
  const previewText = document.getElementById('rule-preview-text');
  if (!previewText) return;
  
  if (!currentInteraction.component || !currentInteraction.primaryAction) {
    previewText.textContent = 'Select a component type and define the primary click action';
    return;
  }
  
  const componentName = selectedComponent?.name || 'Unknown Component';
  const actionText = currentInteraction.primaryAction;
  const rulesCount = currentInteraction.conditionalRules.length;
  
  let preview = `When ${componentName} is clicked, change to "${actionText}"`;
  
  if (rulesCount > 0) {
    preview += `\nApply ${rulesCount} conditional rule${rulesCount !== 1 ? 's' : ''} to other instances`;
  }
  
  previewText.textContent = preview;
}

// Render conditional rules function
function renderConditionalRules() {
  const container = document.getElementById('conditional-rules');
  if (!container) return;
  
  container.innerHTML = '';
  
  if (currentInteraction.conditionalRules.length === 0) {
    container.innerHTML = '<div class="empty-rules">No conditional rules added yet</div>';
    return;
  }
  
  currentInteraction.conditionalRules.forEach((rule, index) => {
    const ruleElement = document.createElement('div');
    ruleElement.className = 'conditional-rule-item';
    ruleElement.innerHTML = `
      <div class="rule-if-label">If:</div>
      <select class="rule-condition" data-rule-index="${index}" data-rule-part="condition">
        <option value="">Select condition...</option>
        ${generateConditionOptions()}
      </select>
      <div class="rule-then-label">Then:</div>
      <select class="rule-action" data-rule-index="${index}" data-rule-part="action">
        <option value="">Select action...</option>
        ${generateActionOptions()}
      </select>
      <button class="remove-rule" data-rule-index="${index}">×</button>
    `;
    
    // Set current values
    const conditionSelect = ruleElement.querySelector('[data-rule-part="condition"]');
    const actionSelect = ruleElement.querySelector('[data-rule-part="action"]');
    
    if (conditionSelect) conditionSelect.value = rule.condition;
    if (actionSelect) actionSelect.value = rule.action;
    
    // Add event listeners
    conditionSelect?.addEventListener('change', (e) => {
      currentInteraction.conditionalRules[index].condition = e.target.value;
      updateRulePreview();
    });
    
    actionSelect?.addEventListener('change', (e) => {
      currentInteraction.conditionalRules[index].action = e.target.value;
      updateRulePreview();
    });
    
    ruleElement.querySelector('.remove-rule')?.addEventListener('click', () => {
      removeConditionalRule(index);
    });
    
    container.appendChild(ruleElement);
  });
}

// Generate condition options
function generateConditionOptions() {
  if (!selectedComponent) return '';
  
  const options = [];
  Object.entries(selectedComponent.properties).forEach(([propName, values]) => {
    values.forEach(value => {
      options.push(`<option value="${propName}=${value}">${propName} = ${value}</option>`);
    });
  });
  
  return options.join('');
}

// Generate action options
function generateActionOptions() {
  if (!selectedComponent) return '';
  
  const options = [];
  Object.entries(selectedComponent.properties).forEach(([propName, values]) => {
    values.forEach(value => {
      options.push(`<option value="${propName}=${value}">${propName} = ${value}</option>`);
    });
  });
  
  options.push(`<option value="${RESET_TO_INITIAL}">Reset to initial state</option>`);
  
  return options.join('');
}

// Remove conditional rule function
function removeConditionalRule(index) {
  currentInteraction.conditionalRules.splice(index, 1);
  renderConditionalRules();
  updateRulePreview();
}

// Update primary action states function
function updatePrimaryActionStates() {
  const primaryActionSelect = document.getElementById('primary-action');
  if (!primaryActionSelect || !selectedComponent) return;
  
  primaryActionSelect.innerHTML = '<option value="">Select target state...</option>';
  
  Object.entries(selectedComponent.properties).forEach(([propName, values]) => {
    values.forEach(value => {
      const option = document.createElement('option');
      option.value = `${propName}=${value}`;
      option.textContent = `${propName} = ${value}`;
      primaryActionSelect.appendChild(option);
    });
  });
}

// Populate existing interaction function
function populateExistingInteraction(interaction) {
  currentInteraction = { ...interaction };
  updatePrimaryActionStates();
  
  const primaryActionSelect = document.getElementById('primary-action');
  if (primaryActionSelect) {
    primaryActionSelect.value = interaction.primaryAction;
  }
  
  renderConditionalRules();
  updateRulePreview();
}

// Reset interaction builder function
function resetInteractionBuilder() {
  currentInteraction = {
    component: '',
    primaryAction: '',
    conditionalRules: []
  };
  
  const primaryActionSelect = document.getElementById('primary-action');
  if (primaryActionSelect) {
    primaryActionSelect.innerHTML = '<option value="">Select target state...</option>';
  }
  
  renderConditionalRules();
  updateRulePreview();
}

// Show status function
function showStatus(message, type = 'info') {
  const statusEl = document.getElementById('status');
  if (!statusEl) return;
  
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
  statusEl.style.display = 'block';
  
  // Auto-hide after 5 seconds
  setTimeout(() => {
    statusEl.style.display = 'none';
  }, 5000);
}

// Listen for messages from plugin
window.onmessage = (event) => {
  const msg = event.data.pluginMessage;
  
  switch (msg.type) {
    case 'selection-changed': {
      // Show loading state when selection changes
      resetUIState();
      const loadingEl = document.getElementById('loading');
      const emptyStateEl = document.getElementById('empty-state');
      const componentListEl = document.getElementById('component-list');
      
      if (loadingEl) loadingEl.style.display = 'block';
      if (emptyStateEl) emptyStateEl.style.display = 'none';
      if (componentListEl) componentListEl.style.display = 'none';
      break;
    }
    case 'init-success':
      handleInitSuccess(msg.data);
      break;
    case 'error': {
      showStatus(msg.message, 'error');
      resetUIState();
      const loadingEl = document.getElementById('loading');
      const emptyStateEl = document.getElementById('empty-state');
      const componentListEl = document.getElementById('component-list');
      
      if (loadingEl) loadingEl.style.display = 'none';
      if (emptyStateEl) emptyStateEl.style.display = 'block';
      if (componentListEl) componentListEl.style.display = 'none';
      break;
    }
    case 'interaction-created':
      showStatus(msg.message, 'success');
      resetInteractionBuilder();
      break;
    default:
      console.log('Unknown message type:', msg.type);
  }
};

// Handle successful initialization
function handleInitSuccess(data) {
  componentData = data.components;
  existingInteractions = data.existingInteractions || {};
  
  // Reset UI state
  resetUIState();
  
  const loadingEl = document.getElementById('loading');
  const emptyStateEl = document.getElementById('empty-state');
  const componentListEl = document.getElementById('component-list');
  
  if (loadingEl) loadingEl.style.display = 'none';
  
  if (componentData.length === 0) {
    if (emptyStateEl) emptyStateEl.style.display = 'block';
    if (componentListEl) componentListEl.style.display = 'none';
  } else {
    if (emptyStateEl) emptyStateEl.style.display = 'none';
    renderComponentList();
    if (componentListEl) componentListEl.style.display = 'block';
  }
}

// Reset UI state when selection changes
function resetUIState() {
  // Clear any selected component
  selectedComponent = null;
  
  // Hide rule builder and show no-selection state
  const ruleBuilderEl = document.getElementById('rule-builder');
  const noSelectionEl = document.getElementById('no-selection');
  
  if (ruleBuilderEl) ruleBuilderEl.classList.remove('active');
  if (noSelectionEl) noSelectionEl.style.display = 'block';
  
  // Reset interaction builder
  resetInteractionBuilder();
  
  // Clear any status messages
  const statusEl = document.getElementById('status');
  if (statusEl) statusEl.style.display = 'none';
}

// Render component list
function renderComponentList() {
  const list = document.getElementById('component-list');
  if (!list) return;
  
  list.innerHTML = '';

  componentData.forEach(component => {
    const li = document.createElement('li');
    li.className = 'component-item';
    li.dataset.componentId = component.id;
    
    const propertiesCount = Object.keys(component.properties).length;
    const instancesCount = component.instances.length;
    
    // Check if this component has existing interactions
    const hasExistingInteraction = existingInteractions[component.id];
    const interactionIndicator = hasExistingInteraction ? ' 🎛️' : '';
    
    li.innerHTML = `
      <div class="component-name">🧩 ${component.name}${interactionIndicator}</div>
      <div class="component-info">
        Rules apply to ${instancesCount} instance${instancesCount !== 1 ? 's' : ''} • 
        ${propertiesCount} variant propert${propertiesCount !== 1 ? 'ies' : 'y'}
        ${hasExistingInteraction ? ' • Has existing interactions' : ''}
      </div>
    `;
    
    list.appendChild(li);
  });
}

// Select component
function selectComponent(componentId) {
  // Update UI selection
  document.querySelectorAll('.component-item').forEach(item => {
    item.classList.remove('selected');
  });
  const selectedItem = document.querySelector(`[data-component-id="${componentId}"]`);
  if (selectedItem) selectedItem.classList.add('selected');

  // Update selected component and current interaction
  selectedComponent = componentData.find(c => c.id === componentId);
  currentInteraction.component = componentId;
  
  // Show rule builder
  const noSelectionEl = document.getElementById('no-selection');
  const ruleBuilderEl = document.getElementById('rule-builder');
  
  if (noSelectionEl) noSelectionEl.style.display = 'none';
  if (ruleBuilderEl) ruleBuilderEl.classList.add('active');
  
  // Update dropdowns
  updatePrimaryActionStates();
  
  // Check for existing interactions and populate UI
  const existingInteraction = existingInteractions[componentId];
  if (existingInteraction) {
    populateExistingInteraction(existingInteraction);
  } else {
    resetInteractionBuilder();
  }
  
  renderConditionalRules();
} 