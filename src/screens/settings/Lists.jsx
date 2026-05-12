import SimpleListSettings from './SimpleListSettings'
import {
  DEFAULT_ROOMS, DEFAULT_MATERIALS, DEFAULT_EQUIPMENT,
  DEFAULT_LOSS_SOURCES,
} from '../../lib/defaults'

function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}

export function SettingsRooms() {
  return (
    <SimpleListSettings
      settingType="rooms"
      title="Rooms"
      description="The room list shown in pickers when adding affected rooms or scoping items."
      itemNoun="room"
      defaultsBuilder={() => DEFAULT_ROOMS.map((r) => ({ key: slug(r), label: r }))}
    />
  )
}

export function SettingsMaterials() {
  return (
    <SimpleListSettings
      settingType="materials"
      title="Materials"
      description="The material chips shown in the Affected Rooms screen and the Add Reading form."
      itemNoun="material"
      defaultsBuilder={() => DEFAULT_MATERIALS}
      allowKeyEdit
    />
  )
}

export function SettingsEquipment() {
  return (
    <SimpleListSettings
      settingType="equipment"
      title="Equipment"
      description="Equipment types in the Place Equipment dropdown. The asset label prefix is auto-derived from the label (e.g. 'Axial air mover' → 'AIR MOVER 1', 'AIR MOVER 2', ...)."
      itemNoun="equipment type"
      defaultsBuilder={() => DEFAULT_EQUIPMENT}
      allowKeyEdit
    />
  )
}

export function SettingsLossSources() {
  return (
    <SimpleListSettings
      settingType="loss_sources"
      title="Loss sources"
      description="The 'Reported source of loss' dropdown in the New Job intake form."
      itemNoun="source"
      defaultsBuilder={() => DEFAULT_LOSS_SOURCES.map((s) => ({ key: slug(s), label: s }))}
    />
  )
}
