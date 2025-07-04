// Component analysis module for detecting and analyzing component variants
/// <reference types="@figma/plugin-typings" />

export interface ComponentInfo {
  id: string;
  name: string;
  instances: InstanceNode[];
  states: string[];
  properties: { [key: string]: string[] };
}

export interface PropertyAnalysisResult {
  actualPropertyName: string | null;
  isVariantProperty: boolean;
}

/**
 * Find all nested component instances within a selected node
 */
export function findNestedInstances(node: SceneNode): InstanceNode[] {
  const instances: InstanceNode[] = [];
  
  function traverse(node: SceneNode) {
    if (node.type === 'INSTANCE') {
      instances.push(node);
    }
    
    if ('children' in node) {
      for (const child of node.children) {
        traverse(child);
      }
    }
  }
  
  // Start traversal from children (exclude the main selected instance)
  if ('children' in node) {
    for (const child of node.children) {
      traverse(child);
    }
  }
  
  return instances;
}

/**
 * Group component instances by their component set or individual component
 */
export async function groupInstancesByComponent(instances: InstanceNode[]): Promise<ComponentInfo[]> {
  const componentMap = new Map<string, ComponentInfo>();
  
  for (const instance of instances) {
    const mainComponent = await instance.getMainComponentAsync();
    if (!mainComponent) continue;
    
    // Check if this component is part of a component set
    const componentSet = mainComponent.parent;
    let groupingId: string;
    let groupingName: string;
    
    if (componentSet && componentSet.type === 'COMPONENT_SET') {
      // Group by component set (all variants together)
      groupingId = componentSet.id;
      groupingName = componentSet.name;
    } else {
      // Fallback to individual component (non-variant components)
      groupingId = mainComponent.id;
      groupingName = mainComponent.name;
    }
    
    if (!componentMap.has(groupingId)) {
      componentMap.set(groupingId, {
        id: groupingId,
        name: groupingName,
        instances: [],
        states: [],
        properties: {}
      });
    }
    
    const componentInfo = componentMap.get(groupingId)!;
    componentInfo.instances.push(instance);
    
    // Extract states from component properties
    if (instance.componentProperties && componentSet && componentSet.type === 'COMPONENT_SET') {
      const componentSetNode = componentSet as ComponentSetNode;
      
      for (const [propName, _propValue] of Object.entries(instance.componentProperties)) {
        if (!componentInfo.properties[propName]) {
          componentInfo.properties[propName] = [];
        }
        
        // Get all possible values for this property from the component set
        if (componentSetNode.componentPropertyDefinitions) {
          const propDef = componentSetNode.componentPropertyDefinitions[propName];
          if (propDef && propDef.type === 'VARIANT' && propDef.variantOptions) {
            // Add all variant options for this property
            propDef.variantOptions.forEach(option => {
              if (!componentInfo.properties[propName].includes(option)) {
                componentInfo.properties[propName].push(option);
              }
            });
          }
        }
      }
    }
  }
  
  return Array.from(componentMap.values());
}

/**
 * Find the actual VARIANT property name for a component
 */
export async function findVariantProperty(
  primaryProp: string, 
  instances: InstanceNode[]
): Promise<PropertyAnalysisResult> {
  if (instances.length === 0) {
    return { actualPropertyName: null, isVariantProperty: false };
  }

  const firstInstance = instances[0];
  const mainComponent = await firstInstance.getMainComponentAsync();
  const componentSet = mainComponent?.parent;
  
  // Check the component set for VARIANT properties
  if (componentSet && componentSet.type === 'COMPONENT_SET') {
    const componentSetNode = componentSet as ComponentSetNode;
    
    if (componentSetNode.componentPropertyDefinitions) {
      for (const [propName, propDef] of Object.entries(componentSetNode.componentPropertyDefinitions)) {
        // Only match VARIANT type properties
        if (propDef.type === 'VARIANT' && 
            (propName === primaryProp || propName.toLowerCase() === primaryProp.toLowerCase())) {
          return { actualPropertyName: propName, isVariantProperty: true };
        }
      }
    }
  }
  
  return { actualPropertyName: null, isVariantProperty: false };
} 