import { createTreeCollection } from '@ark-ui/react/tree-view';

export interface PreviewNode {
  id: string;
  name: string;
  children?: PreviewNode[];
}

/** Authored UI fixture, unrelated to native selection or binary inspection. */
export const previewInventory = createTreeCollection<PreviewNode>({
  nodeToValue: (node) => node.id,
  nodeToString: (node) => node.name,
  rootNode: {
    id: 'preview-root',
    name: '',
    children: [
      {
        id: 'application',
        name: 'Application.app',
        children: [
          {
            id: 'contents',
            name: 'Contents',
            children: [
              {
                id: 'macos',
                name: 'MacOS',
                children: [{ id: 'main-executable', name: 'Application' }],
              },
              {
                id: 'resources',
                name: 'Resources',
                children: [
                  { id: 'settings', name: 'Settings.plist' },
                  { id: 'localization', name: 'Localizable.strings' },
                ],
              },
              {
                id: 'frameworks',
                name: 'Frameworks',
                children: [
                  {
                    id: 'example-framework',
                    name: 'Example.framework',
                    children: [
                      { id: 'framework-binary', name: 'Example' },
                      { id: 'framework-info', name: 'Info.plist' },
                    ],
                  },
                ],
              },
              { id: 'application-info', name: 'Info.plist' },
            ],
          },
        ],
      },
    ],
  },
});

export const defaultPreviewSelectionId = 'framework-binary';
