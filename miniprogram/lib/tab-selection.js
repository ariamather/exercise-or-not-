function selectTab(page, active) {
  const tab = typeof page.getTabBar === 'function' && page.getTabBar()
  if (tab && typeof tab.setData === 'function') tab.setData({ active })
}
module.exports = { selectTab }
