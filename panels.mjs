import * as props from './props.mjs';
import * as utils from './utils.mjs';
import * as functions from './functions.mjs';
import * as operators from './operators.mjs';
import * as previews from './previews.mjs';
// ----------------------------------------------------------------------------------

const NUMBER_LIMIT = 1000000000;
const TEXTURE_FILTER = 'Images (*.png *.jpg *.jpeg *.bmp)';
const LEFT_WIDTH = 300;
const LEFT_LABEL_WIDTH = 120;
const LEFT_PERCENT = 0.25;
const MIDDLE_WIDTH = 440;
const MIDDLE_LABEL_WIDTH = 175;
const MIDDLE_PERCENT = 0.37;
const MIDDLE_SLOTS = 6;
const LABEL_PERCENT = 0.4;
const TABLE_LABEL_WIDTH = 56;
const TABLE_CELL_WIDTH = 60;
const TABLE_CELL_MAX_WIDTH = 120;
const COLUMN_GAP = 12;
const ROW_RESERVE = 240;
const PLAY_WIDTH = 70;
const REMOVE_WIDTH = 28;
const LAYOUT_WATCH_INTERVAL = 400;

let dialog = null;
let drawPending = false;
let fittedWidth = null;
let columns = computeColumns(0);
let layoutTimerDialog = null;
let layoutTimer = null;
const connectedMaps = [];
const foldouts = { Export: true, Create: true };
const problemLabels = [];

export function register() {
  tiled.registerAction('LegacyMakerPanel', openPanel).text = 'Legacy Game Maker: Panel';

  tiled.activeAssetChanged.connect(asset => {
    connectMap(asset);
    requestDraw();
  });

  if (tiled.mapEditor) {
    tiled.mapEditor.currentBrushChanged.connect(requestDraw);
  }

  previews.onPlayChanged(requestDraw);
}

function openPanel() {
  if (!dialog) {
    const panel = new Dialog('Legacy Game Maker');
    panel.newRowMode = Dialog.ManualRows;

    // Tiled deletes the dialogs when they are closed
    panel.finished.connect(() => {
      if (dialog === panel) {
        dialog = null;
      }
    });

    dialog = panel;
  }

  connectMap(tiled.activeAsset);
  dialog.showMaximized();
  startLayoutWatch();
  draw();

  // The panel is maximized again after its first layout, it could be restored by it
  const panel = dialog;
  Qt.callLater(() => {
    if (dialog === panel && panel.visible) {
      panel.showMaximized();
    }
  });
}

// ----------------------------------------------------------------------------------
// COLUMNS
// ----------------------------------------------------------------------------------
/**
 * Widths of the columns in percent of the width of a maximized panel, the third column takes
 * the rest. The margins and the spacing of the rows, unknown to scripts, are kept out of it
 * (ROW_RESERVE). The left and middle columns are reduced when the frames table would not fit.
 * The compact widths are the minimums: they are used when the panel is not maximized
 * (width 0), the minimum width of the panel is the sum of the fixed widths.
 */
function computeColumns(width) {
  let left = Math.round(width * LEFT_PERCENT);
  let middle = Math.round(width * MIDDLE_PERCENT);
  const available = width - 2 * COLUMN_GAP - ROW_RESERVE - (TABLE_LABEL_WIDTH + REMOVE_WIDTH + 4 * TABLE_CELL_WIDTH);
  if (left + middle > available) {
    const scale = Math.max(0, available) / (left + middle || 1);
    left = Math.round(left * scale);
    middle = Math.round(middle * scale);
  }

  left = Math.max(LEFT_WIDTH, left);
  middle = Math.max(MIDDLE_WIDTH, middle);
  const third = width - left - middle - 2 * COLUMN_GAP - ROW_RESERVE;
  const tableCell = Math.floor((third - TABLE_LABEL_WIDTH - REMOVE_WIDTH) / 4);

  return {
    width: width,
    left: left,
    leftLabel: Math.max(LEFT_LABEL_WIDTH, Math.round(left * LABEL_PERCENT)),
    middle: middle,
    middleLabel: Math.max(MIDDLE_LABEL_WIDTH, Math.round(middle * LABEL_PERCENT)),
    tableCell: Math.min(TABLE_CELL_MAX_WIDTH, Math.max(TABLE_CELL_WIDTH, tableCell))
  };
}

function getLayoutWidth() {
  return dialog.maximized || dialog.fullScreen ? dialog.width : 0;
}

/**
 * Tiled has no signal for the resize of a dialog, the width of the panel is checked while it
 * is open (clicked signal of a hidden auto repeat button, kept referenced).
 */
function startLayoutWatch() {
  if (!layoutTimer) {
    layoutTimerDialog = new Dialog('Legacy Game Maker Layout');
    layoutTimer = layoutTimerDialog.addButton('');
    layoutTimer.autoRepeat = true;
    layoutTimer.autoRepeatDelay = LAYOUT_WATCH_INTERVAL;
    layoutTimer.autoRepeatInterval = LAYOUT_WATCH_INTERVAL;
    layoutTimer.clicked.connect(onLayoutTick);
  }

  layoutTimer.down = true;
}

function onLayoutTick() {
  if (!dialog || !dialog.visible) {
    layoutTimer.down = false;
    return;
  }

  if (Math.abs(getLayoutWidth() - columns.width) > 2) {
    requestDraw();
  }
}

function connectMap(asset) {
  if (!asset || !asset.isTileMap || connectedMaps.includes(asset)) {
    return;
  }

  asset.selectedObjectsChanged.connect(requestDraw);
  connectedMaps.push(asset);
}

/**
 * Widgets cannot be destroyed from their own signals, the panel is drawn again later.
 */
function requestDraw() {
  if (drawPending || !dialog || !dialog.visible) {
    return;
  }

  drawPending = true;
  Qt.callLater(() => {
    drawPending = false;
    draw();
  });
}

// ----------------------------------------------------------------------------------
// DRAW
// The dialog has a single grid, the three columns are emulated on each row: left cells and
// middle cells (selection) with a fixed total width, then the cells of the tables (frames of
// the opened animations).
// A left row has two cells (label and control, two buttons, or one cell and an empty one).
// ----------------------------------------------------------------------------------
function draw() {
  if (!dialog || !dialog.visible) {
    return;
  }

  problemLabels.length = 0;
  dialog.clear();
  columns = computeColumns(getLayoutWidth());

  const map = tiled.activeAsset;
  if (!map || !map.isTileMap) {
    dialog.addLabel('Open a map to use Legacy Game Maker.');
    return;
  }

  const left = [];
  const middle = [];
  const right = [];

  // START EXPORT
  if (drawFoldout(left, 'Export', 'Export')) {
    drawFields(map, left, map, props.MAP_FIELDS, 'MAP');
    addRow(left, [
      () => button('Export Pack', () => operators.exportPack(false, map)),
      () => button('Export Selected Objects', () => operators.exportPack(true, map))
    ]);
  }
  // END EXPORT

  // START CREATE
  if (drawFoldout(left, 'Create', 'Create')) {
    for (let i = 0; i < operators.CREATE_OPERATORS.length; i += 2) {
      addRow(left, operators.CREATE_OPERATORS.slice(i, i + 2).map(operator => {
        return () => button(operator.text, () => operators.createObject(operator, map));
      }));
    }
  }
  // END CREATE

  const objects = map.selectedObjects;
  const object = objects.length == 1 ? objects[0] : null;
  const type = object ? utils.getObjectType(object) : '';

  // START TILE
  const tiles = tiled.mapEditor ? tiled.mapEditor.tilesetsView.selectedTiles : [];
  if (tiles.length == 1 && type != props.LAYER_JAS) {
    addHeading(middle, `Tile ${tiles[0].id + 1} (${tiles[0].tileset.name})`);
    drawFields(map, middle, tiles[0], props.TILE_FIELDS, 'TILE');
  }
  // END TILE

  // START OBJECT
  if (type != '') {
    addHeading(middle, `${type}: ${utils.getExportName(object)}`);

    if (type == props.LAYER_JLM) {
      const text = object.polygon.length > 0 ? `${object.polygon.length} points` : 'Use a polyline or a polygon object';
      addRow(middle, [() => dialog.addLabel(text)]);
    }

    if (type == props.LAYER_JSS || type == props.LAYER_JAS) {
      addProblem(middle, () => previews.getProblem(map, object));
    }

    drawFields(map, middle, object, props.OBJECT_FIELDS[type], type, { column: right, title: '' });
  }
  // END OBJECT

  if (middle.length == 0) {
    addRow(middle, [() => dialog.addLabel('Select an object or a tile to edit its properties.')]);
  }

  if (type == props.LAYER_JAS && right.length == 0) {
    addRow(right, [() => dialog.addLabel('Open an animation to edit its frames.')]);
  }

  drawRows(left, middle, right);
  Qt.callLater(fitSize);
}

/**
 * The panel cannot scroll, its height follows the opened foldouts. Its width is the minimum
 * width, unless the user has resized it. A maximized panel keeps its size, it gets the fitted
 * width again when it is restored.
 */
function fitSize() {
  if (!dialog || !dialog.visible) {
    return;
  }

  if (dialog.maximized || dialog.fullScreen) {
    fittedWidth = null;
    return;
  }

  const minimumWidth = Math.max(dialog.minimumWidth, dialog.minimumSizeHint.width);
  const width = fittedWidth === null || dialog.width == fittedWidth || dialog.width < minimumWidth ? minimumWidth : dialog.width;
  dialog.size = Qt.size(width, dialog.minimumSizeHint.height);
  fittedWidth = dialog.width;
}

// ----------------------------------------------------------------------------------
// ROWS
// ----------------------------------------------------------------------------------
function addRow(column, cells, label = null, fill = false) {
  column.push({ cells: cells, label: label, fill: fill });
}

/**
 * The panel is drawn again when a problem appears or disappears, after the edit of a number
 * input to keep the focus while typing.
 */
function addProblem(column, getProblem) {
  const item = { label: null, problem: getProblem(), getProblem: getProblem };
  problemLabels.push(item);
  if (!item.problem) {
    return;
  }

  addRow(column, [() => {
    item.label = dialog.addLabel('Preview: ' + item.problem);
    item.label.wordWrap = true;
    item.label.styleSheet = 'color: #d03030';
    return item.label;
  }]);
}

function updateProblems() {
  for (const item of problemLabels) {
    const problem = item.getProblem();
    if ((problem != '') != (item.problem != '')) {
      requestDraw();
      return;
    }

    if (problem != item.problem) {
      item.problem = problem;
      item.label.text = 'Preview: ' + problem;
    }
  }
}

function addHeading(column, text) {
  addRow(column, [() => createHeading(text)]);
}

function createHeading(text) {
  const heading = dialog.addLabel(text);
  heading.styleSheet = 'font-weight: bold; border-bottom: 1px solid palette(mid)';
  return heading;
}

function drawRows(left, middle, right) {
  for (let i = 0; i < Math.max(left.length, middle.length, right.length); i++) {
    dialog.addNewRow();
    drawLeftRow(left[i]);
    setFixedWidth(dialog.addLabel(''), COLUMN_GAP);
    drawFixedRow(middle[i], columns.middle, columns.middleLabel, MIDDLE_SLOTS);
    setFixedWidth(dialog.addLabel(''), COLUMN_GAP);
    drawFlexibleRow(right[i], TABLE_LABEL_WIDTH);
  }

  drawFillerRow();
}

/**
 * The rows have a fixed height, the grid spreads the extra height of the panel between them.
 * The last row takes it instead: a text edit is the only dialog widget that grows vertically.
 */
function drawFillerRow() {
  dialog.addNewRow();
  const filler = dialog.addTextEdit('');
  filler.enabled = false;
  filler.minimumHeight = 1;
  filler.styleSheet = 'background: transparent; border: none';
}

function drawLeftRow(row) {
  const cells = row ? row.cells.slice() : [];
  let widths = [Math.floor(columns.left / 2), Math.ceil(columns.left / 2)];

  if (row && row.label != null) {
    cells.unshift(() => dialog.addLabel(row.label));
    widths = [columns.leftLabel, columns.left - columns.leftLabel];
  }

  for (let i = 0; i < 2; i++) {
    setFixedWidth(cells[i] ? cells[i]() : dialog.addLabel(''), widths[i]);
  }
}

/**
 * The spacing of the row layout is not known: a fixed row always has the same number of
 * widgets (completed with empty labels of width 0) and the same sum of widths. The widgets
 * without a fixed width share the width left by the others, or keep their size in a filled
 * row (color button).
 */
function drawFixedRow(row, width, labelWidth, slots) {
  const widgets = [];
  if (row && row.label != null) {
    widgets.push(setFixedWidth(dialog.addLabel(row.label), labelWidth));
  }

  for (const cell of row ? row.cells : []) {
    widgets.push(cell());
  }

  const isFixed = widget => widget.minimumWidth == widget.maximumWidth;
  let flexible = widgets.filter(widget => !isFixed(widget));
  if (row && row.fill) {
    for (const widget of flexible) {
      setFixedWidth(widget, widget.sizeHint.width);
    }

    flexible = [];
  }

  if (flexible.length == 0) {
    const filler = dialog.addLabel('');
    widgets.push(filler);
    flexible.push(filler);
  }

  let free = width;
  for (const widget of widgets) {
    free -= isFixed(widget) ? widget.minimumWidth : 0;
  }

  flexible.forEach((widget, i) => {
    const share = Math.floor(free / flexible.length);
    setFixedWidth(widget, i == flexible.length - 1 ? free - share * (flexible.length - 1) : share);
  });

  for (let i = widgets.length; i < slots; i++) {
    setFixedWidth(dialog.addLabel(''), 0);
  }
}

/**
 * A row of fixed widgets ends with an empty label, the layout would spread the extra width
 * between all the widgets of the row and move the other columns.
 */
function drawFlexibleRow(row, labelWidth) {
  if (!row) {
    dialog.addLabel('');
    return;
  }

  if (row.label != null) {
    setFixedWidth(dialog.addLabel(row.label), labelWidth);
  }

  const widgets = row.cells.map(cell => cell());
  if (row.fill || widgets.every(widget => widget.minimumWidth == widget.maximumWidth)) {
    dialog.addLabel('');
  }
}

function setFixedWidth(widget, width) {
  widget.minimumWidth = width;
  widget.maximumWidth = width;
  return widget;
}

function button(text, onClicked) {
  const widget = dialog.addButton(text);
  widget.clicked.connect(onClicked);
  return widget;
}

function removeButton(toolTip, onClicked) {
  const widget = button('\u2715', onClicked);
  widget.toolTip = toolTip;
  return setFixedWidth(widget, REMOVE_WIDTH);
}

// ----------------------------------------------------------------------------------
// FIELDS
// ----------------------------------------------------------------------------------
function drawFoldout(column, id, label, cells = [], defaultOpened = false) {
  const opened = foldouts[id] ?? defaultOpened;

  addRow(column, [() => {
    const widget = button((opened ? '\u25BC ' : '\u25B6 ') + label, () => {
      foldouts[id] = !opened;
      requestDraw();
    });

    widget.flat = true;
    widget.styleSheet = 'text-align: left; font-weight: bold';
    return widget;
  }, ...cells]);

  return opened;
}

/**
 * The tables are drawn in side.column when it is given, after a title (side.title).
 */
function drawFields(map, column, owner, fields, scope = '', side = null) {
  let group = undefined;
  let opened = true;

  for (const field of fields) {
    if (field.group !== group) {
      group = field.group;
      opened = group ? drawFoldout(column, scope + '.' + group, group) : true;
    }

    if (!opened) {
      continue;
    }

    drawField(map, column, owner, fields, field, scope, side);
  }
}

function drawField(map, column, owner, fields, field, scope, side) {
  const value = field.type == 'slot' ? null : props.getValue(owner, field.key, fields);
  const set = (v, check = true) => {
    if (field.mapOffsetAxis !== undefined) {
      operators.setMapOffset(map, field.mapOffsetAxis, v);
    }
    else {
      props.setValue(owner, field.key, fields, v);
    }

    previews.requestRefresh(map);
    if (check) {
      updateProblems();
    }
  };

  switch (field.type) {
    case 'string': {
      addRow(column, [() => {
        const input = dialog.addTextInput('');
        input.text = value;
        input.editingFinished.connect(() => set(input.text));
        return input;
      }], field.label);
      break;
    }
    case 'int':
    case 'number': {
      addRow(column, [() => {
        const input = createNumberInput(field.type == 'int', value);
        input.valueChanged.connect(v => set(v, false));
        input.editingFinished.connect(updateProblems);
        return input;
      }], field.label);
      break;
    }
    case 'bool': {
      addRow(column, [() => {
        const input = dialog.addCheckBox('');
        input.checked = value;
        input.stateChanged.connect(() => set(input.checked));
        return input;
      }], field.label);
      break;
    }
    case 'enum':
    case 'model': {
      const items = field.type == 'model' ? [''].concat(functions.getModelNames(map)) : field.items.slice();
      if (!items.includes(value)) {
        items.push(value);
      }

      addRow(column, [() => {
        const input = dialog.addComboBox('', items);
        input.currentIndex = items.indexOf(value);
        input.currentIndexChanged.connect(i => {
          set(items[i]);
          requestDraw();
        });
        return input;
      }], field.label);
      break;
    }
    case 'file':
    case 'directory': {
      addRow(column, [() => {
        const input = dialog.addFilePicker('');
        input.isDirectory = field.type == 'directory';
        if (field.type == 'file') {
          input.filter = TEXTURE_FILTER;
        }

        input.fileName = utils.resolvePath(map, value);
        input.fileUrlChanged.connect(() => set(utils.relativePath(map, input.fileName)));
        return input;
      }], field.label);
      break;
    }
    case 'vector': {
      const inputs = [];
      const cells = [];
      for (let i = 0; i < field.size; i++) {
        cells.push(() => {
          const input = createNumberInput(false, value[i]);
          input.valueChanged.connect(() => set(inputs.map(input => input.value), false));
          input.editingFinished.connect(updateProblems);
          inputs.push(input);
          return input;
        });
      }

      addRow(column, cells, field.label);
      break;
    }
    case 'color': {
      addRow(column, [() => {
        const input = dialog.addColorButton('');
        input.color = utils.rgbToColor(value);
        input.colorChanged.connect(() => set(utils.colorToRgb(input.color)));
        return input;
      }], field.label, true);
      break;
    }
    case 'slot': {
      const slot = props.getSlot(owner, field.key);
      addRow(column, [
        () => {
          const name = dialog.addTextInput('');
          name.text = slot.name;
          name.editingFinished.connect(() => owner.setProperty(field.key + 'Name', name.text));
          return name;
        },
        () => {
          const val = dialog.addTextInput('');
          val.text = slot.value;
          val.editingFinished.connect(() => owner.setProperty(field.key + 'Value', val.text));
          return val;
        }
      ], field.label);
      break;
    }
    case 'list': {
      const get = () => props.getValue(owner, field.key, fields);
      if (field.table) {
        drawTable(side ? side.column : column, field, scope, get, set, side ? side.title : '');
        break;
      }

      if (field.label != field.group) {
        addHeading(column, field.label);
      }

      addRow(column, [
        () => button('Add', () => {
          foldouts[`${scope}.${field.key}.${get().length}`] = true;
          set(get().concat([props.createListItem(field)]));
          requestDraw();
        })
      ]);

      for (let i = 0; i < value.length; i++) {
        const itemOwner = props.createListItemOwner(owner, field, i);
        const title = `${field.label} ${i + 1}`;
        const itemScope = `${scope}.${field.key}.${i}`;
        const remove = () => removeButton(`Remove ${title}`, () => {
          if (field.playable && value.some((item, j) => previews.isPlaying(owner, j))) {
            previews.stop();
          }

          shiftFoldouts(`${scope}.${field.key}`, i);
          set(get().filter((item, j) => j != i));
          requestDraw();
        });

        if (!field.collapsible) {
          addRow(column, [() => createHeading(title), remove]);
          drawFields(map, column, itemOwner, field.fields, itemScope, side);
          continue;
        }

        const name = props.findField(field.fields, 'Name') ? props.getValue(itemOwner, 'Name', field.fields) : '';
        const fullTitle = name ? `${title}: ${name}` : title;
        const cells = [];
        if (field.playable) {
          const playing = previews.isPlaying(owner, i);
          cells.push(() => {
            const widget = button(playing ? 'Stop' : 'Play', () => playing ? previews.stop() : previews.play(map, owner, i));
            return setFixedWidth(widget, PLAY_WIDTH);
          });
        }

        cells.push(remove);
        const opened = drawFoldout(column, itemScope, fullTitle, cells);
        if (field.playable) {
          addProblem(column, () => previews.getAnimationProblem(map, owner, i));
        }

        if (opened) {
          drawFields(map, column, itemOwner, field.fields, itemScope, side ? { column: side.column, title: fullTitle } : null);
        }
      }
      break;
    }
  }
}

/**
 * A table list is a foldout, opened by default, with a row of number inputs per item.
 */
function drawTable(column, field, scope, get, set, title) {
  const items = get();
  const label = `${field.label} (${items.length})`;
  if (!drawFoldout(column, `${scope}.${field.key}`, title ? `${title} - ${label}` : label, [], true)) {
    return;
  }

  addRow(column, field.fields.map(cellField => () => setFixedWidth(dialog.addLabel(cellField.label), columns.tableCell)), '');

  for (let i = 0; i < items.length; i++) {
    const itemOwner = props.createListItemOwner({ property: () => get(), setProperty: (key, v) => set(JSON.parse(v), false) }, field, i);
    addRow(column, field.fields.map(cellField => () => {
      const input = createNumberInput(cellField.type == 'int', props.getValue(itemOwner, cellField.key, field.fields));
      input.valueChanged.connect(v => props.setValue(itemOwner, cellField.key, field.fields, v));
      input.editingFinished.connect(updateProblems);
      return setFixedWidth(input, columns.tableCell);
    }).concat([() => removeButton(`Remove ${field.itemLabel} ${i + 1}`, () => {
      set(get().filter((item, j) => j != i));
      requestDraw();
    })]), `${field.itemLabel} ${i + 1}`);
  }

  addRow(column, [
    () => button('Add', () => {
      set(get().concat([createNextTableItem(field, get())]));
      requestDraw();
    })
  ]);
}

/**
 * The foldout states of the items after a removed item move with them.
 */
function shiftFoldouts(prefix, index) {
  const entries = Object.entries(foldouts).map(([key, opened]) => {
    const match = key.startsWith(prefix + '.') ? key.slice(prefix.length + 1).match(/^(\d+)(\..*)?$/) : null;
    return { key: key, opened: opened, index: match ? Number(match[1]) : -1, rest: match ? match[2] ?? '' : '' };
  });

  for (const entry of entries) {
    if (entry.index >= index) {
      delete foldouts[entry.key];
    }
  }

  for (const entry of entries) {
    if (entry.index > index) {
      foldouts[`${prefix}.${entry.index - 1}${entry.rest}`] = entry.opened;
    }
  }
}

/**
 * A new frame follows the last one on the right.
 */
function createNextTableItem(field, items) {
  const last = items[items.length - 1];
  if (!last) {
    return props.createListItem(field);
  }

  const item = Object.assign({}, last);
  if ('X' in item && 'Width' in item) {
    item.X = last.X + last.Width;
  }

  return item;
}

function createNumberInput(isInt, value) {
  const input = dialog.addNumberInput('');
  input.decimals = isInt ? 0 : 3;
  input.minimum = -NUMBER_LIMIT;
  input.maximum = NUMBER_LIMIT;
  input.value = value;
  return input;
}
