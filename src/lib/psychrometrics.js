/**
 * psychrometrics.js — climate/drying math helpers.
 *
 * Drying restoration techs work with three common air properties:
 *   - Dry-bulb temperature in °F
 *   - Relative humidity in %
 *   - Specific humidity in grains per pound (GPP)
 *
 * Adjusters use GPP to verify drying is happening: outside GPP vs in-chamber
 * GPP vs dehu exhaust GPP should all show the chamber being drier and the
 * dehu actively pulling moisture.
 *
 * The conversion uses the ASHRAE psychrometric equations. For the operating
 * range of restoration work (40-100°F, 10-100% RH), the simplified Magnus
 * approximation is accurate to within ~0.5 GPP, which is well within the
 * precision of a typical thermo-hygrometer.
 *
 * gppFromTempRh(tempF, rh):
 *   tempF: dry-bulb temperature in degrees Fahrenheit
 *   rh:    relative humidity as a percentage (0-100)
 *   returns: GPP rounded to 1 decimal, or null if inputs invalid.
 */

export function gppFromTempRh(tempF, rh) {
  const t = parseFloat(tempF)
  const r = parseFloat(rh)
  if (!Number.isFinite(t) || !Number.isFinite(r)) return null
  if (r < 0 || r > 100) return null
  if (t < -40 || t > 200) return null

  // Convert °F → °C
  const tC = (t - 32) * (5 / 9)

  // Saturation vapor pressure (kPa) — Magnus formula
  const eS = 0.6112 * Math.exp((17.62 * tC) / (243.12 + tC))

  // Actual vapor pressure (kPa)
  const eA = eS * (r / 100)

  // Convert kPa → psi (1 kPa = 0.145038 psi)
  // Atmospheric pressure assumed at sea level = 14.696 psi
  const P_atm_psi = 14.696
  const eA_psi = eA * 0.145038

  // Humidity ratio (lb water / lb dry air) per ASHRAE
  const W = 0.62198 * (eA_psi / (P_atm_psi - eA_psi))

  // GPP = (lb water / lb dry air) × 7000 grains / lb
  const gpp = W * 7000
  if (!Number.isFinite(gpp) || gpp < 0) return null
  return Math.round(gpp * 10) / 10
}
