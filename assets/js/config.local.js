/* The sheet this site talks to.
 *
 * With this set, any device that opens the site is connected the moment it
 * loads — nobody is asked to paste a link, and a new phone or a reinstalled
 * browser just works. Change the URL here and re-deploy to point the site at a
 * different sheet; a device can still override it from Settings.
 *
 * Note that the link ends up in the page source, so anyone who can open the
 * site can read it. That is the same exposure as sharing the site address
 * itself, which is the trade-off of a deployment with access set to "Anyone".
 */
window.DAKOTAX_API_URL = 'https://script.google.com/macros/s/AKfycbxuhZ8r909oikBh7pSqOhMx9NJpXggO23t2mVdlSGRNjiri5Pszx43e9Ersf-Oue3yOLw/exec';
