import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './lib/auth.jsx'
import { BrandingProvider } from './lib/branding.jsx'
import RequireAuth from './components/RequireAuth'

import Login from './screens/auth/Login'
import Signup from './screens/auth/Signup'
import JobList from './screens/jobs/JobList'
import JobNew from './screens/jobs/JobNew'
import JobDashboard from './screens/jobs/JobDashboard'
import RoomsList from './screens/jobs/RoomsList'
import RoomDetail from './screens/jobs/RoomDetail'
import PhotosScreen from './screens/jobs/Photos'
import VoiceNotesScreen from './screens/jobs/VoiceNotes'
import ReadingsScreen from './screens/jobs/Readings'
import EquipmentScreen from './screens/jobs/Equipment'
import MonitoringScreen from './screens/jobs/Monitoring'
import ScopeScreen from './screens/jobs/Scope'
import ReviewScreen from './screens/jobs/Review'
import ReportScreen from './screens/jobs/Report'
import EstimateList from './screens/estimates/EstimateList'
import EstimateDetail from './screens/estimates/EstimateDetail'
import EstimatePDFScreen from './screens/estimates/EstimatePDF'
import EstimateSign from './screens/estimates/EstimateSign'
import ScreeningDashboard from './screens/screening/ScreeningDashboard'
import ScreeningAuthorization from './screens/screening/ScreeningAuthorization'
import PropertyHistory from './screens/screening/PropertyHistory'
import ScreeningWalkthrough from './screens/screening/ScreeningWalkthrough'
import ScreeningSamples from './screens/screening/ScreeningSamples'
import ScreeningRecommendationsScreen from './screens/screening/ScreeningRecommendations'
import ScreeningReportPDF from './screens/screening/ScreeningReportPDF'
import SettingsScreeningRecommendations from './screens/settings/ScreeningRecommendations'
import SettingsSporeHandlerProfile from './screens/settings/SporeHandlerProfile'
import SettingsTeam from './screens/settings/Team'
import SettingsBranding from './screens/settings/Branding'
import AcceptInvite from './screens/AcceptInvite'
import Tutorial from './screens/Tutorial'
import TutorialStatic from './screens/TutorialStatic'
import SettingsIndex from './screens/settings/SettingsIndex'
import SettingsDryingGoals from './screens/settings/DryingGoals'
import SettingsMeters from './screens/settings/Meters'
import SettingsScopeLibrary from './screens/settings/ScopeLibrary'
import SettingsQCRules from './screens/settings/QCRules'
import SettingsRateCatalog from './screens/settings/RateCatalog'
import { SettingsRooms, SettingsMaterials, SettingsEquipment, SettingsLossSources } from './screens/settings/Lists'
import ComingSoon from './screens/ComingSoon'

export default function App() {
  return (
    <AuthProvider>
      <BrandingProvider>
        <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />

          <Route path="/" element={<Navigate to="/jobs" replace />} />

          <Route path="/jobs"            element={<RequireAuth><JobList /></RequireAuth>} />
          <Route path="/jobs/new"        element={<RequireAuth><JobNew /></RequireAuth>} />
          <Route path="/jobs/:id"        element={<RequireAuth><JobDashboard /></RequireAuth>} />
          <Route path="/jobs/:id/edit"   element={<RequireAuth><JobNew /></RequireAuth>} />
          <Route path="/jobs/:id/rooms"  element={<RequireAuth><RoomsList /></RequireAuth>} />
          <Route path="/jobs/:id/rooms/:roomId" element={<RequireAuth><RoomDetail /></RequireAuth>} />
          <Route path="/jobs/:id/readings"   element={<RequireAuth><ReadingsScreen /></RequireAuth>} />
          <Route path="/jobs/:id/equipment"  element={<RequireAuth><EquipmentScreen /></RequireAuth>} />
          <Route path="/jobs/:id/monitoring" element={<RequireAuth><MonitoringScreen /></RequireAuth>} />
          <Route path="/jobs/:id/photos"     element={<RequireAuth><PhotosScreen /></RequireAuth>} />
          <Route path="/jobs/:id/voice-notes" element={<RequireAuth><VoiceNotesScreen /></RequireAuth>} />
          <Route path="/jobs/:id/scope"      element={<RequireAuth><ScopeScreen /></RequireAuth>} />
          <Route path="/jobs/:id/review"     element={<RequireAuth><ReviewScreen /></RequireAuth>} />
          <Route path="/jobs/:id/report"     element={<RequireAuth><ReportScreen /></RequireAuth>} />
          <Route path="/jobs/:id/estimates"   element={<RequireAuth><EstimateList /></RequireAuth>} />
          <Route path="/jobs/:id/estimates/:estimateId" element={<RequireAuth><EstimateDetail /></RequireAuth>} />
          <Route path="/jobs/:id/estimates/:estimateId/pdf" element={<RequireAuth><EstimatePDFScreen /></RequireAuth>} />
          <Route path="/jobs/:id/estimates/:estimateId/sign" element={<RequireAuth><EstimateSign /></RequireAuth>} />
          <Route path="/jobs/:id/screening" element={<RequireAuth><ScreeningDashboard /></RequireAuth>} />
          <Route path="/jobs/:id/screening/authorization" element={<RequireAuth><ScreeningAuthorization /></RequireAuth>} />
          <Route path="/jobs/:id/screening/property-history" element={<RequireAuth><PropertyHistory /></RequireAuth>} />
          <Route path="/jobs/:id/screening/walkthrough" element={<RequireAuth><ScreeningWalkthrough /></RequireAuth>} />
          <Route path="/jobs/:id/screening/samples" element={<RequireAuth><ScreeningSamples /></RequireAuth>} />
          <Route path="/jobs/:id/screening/recommendations" element={<RequireAuth><ScreeningRecommendationsScreen /></RequireAuth>} />
          <Route path="/jobs/:id/screening/report" element={<RequireAuth><ScreeningReportPDF /></RequireAuth>} />

          <Route path="/settings"        element={<RequireAuth roles={['owner']}><SettingsIndex /></RequireAuth>} />
          <Route path="/settings/drying-goals"   element={<RequireAuth roles={['owner']}><SettingsDryingGoals /></RequireAuth>} />
          <Route path="/settings/rooms"          element={<RequireAuth roles={['owner']}><SettingsRooms /></RequireAuth>} />
          <Route path="/settings/materials"      element={<RequireAuth roles={['owner']}><SettingsMaterials /></RequireAuth>} />
          <Route path="/settings/meters"         element={<RequireAuth roles={['owner']}><SettingsMeters /></RequireAuth>} />
          <Route path="/settings/equipment"      element={<RequireAuth roles={['owner']}><SettingsEquipment /></RequireAuth>} />
          <Route path="/settings/loss-sources"   element={<RequireAuth roles={['owner']}><SettingsLossSources /></RequireAuth>} />
          <Route path="/settings/scope-library"  element={<RequireAuth roles={['owner']}><SettingsScopeLibrary /></RequireAuth>} />
          <Route path="/settings/qc-rules"       element={<RequireAuth roles={['owner']}><SettingsQCRules /></RequireAuth>} />
          <Route path="/settings/rate-catalog"   element={<RequireAuth roles={['owner']}><SettingsRateCatalog /></RequireAuth>} />
          <Route path="/settings/screening-recommendations" element={<RequireAuth roles={['owner']}><SettingsScreeningRecommendations /></RequireAuth>} />
          <Route path="/settings/spore-handler-profile" element={<RequireAuth roles={['owner']}><SettingsSporeHandlerProfile /></RequireAuth>} />
          <Route path="/settings/team" element={<RequireAuth roles={['owner']}><SettingsTeam /></RequireAuth>} />
          <Route path="/settings/branding" element={<RequireAuth roles={['owner']}><SettingsBranding /></RequireAuth>} />

          {/* Tutorial — available to all authenticated users */}
          <Route path="/tutorial" element={<RequireAuth><Tutorial /></RequireAuth>} />
          <Route path="/tutorial/read/:tourId" element={<RequireAuth><TutorialStatic /></RequireAuth>} />

          {/* Public route — accepts invites without prior auth */}
          <Route path="/invite/:token" element={<AcceptInvite />} />
          <Route path="/settings/team"   element={<RequireAuth roles={['owner']}><ComingSoon title="Team" /></RequireAuth>} />

          <Route path="*" element={<Navigate to="/jobs" replace />} />
        </Routes>
      </BrowserRouter>
      </BrandingProvider>
    </AuthProvider>
  )
}
