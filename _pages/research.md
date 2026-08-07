---
layout: page
permalink: /Research/
title: Research
years: [2026, 2025, 2024]
nav: true
nav_order: 1
molecular_graphs: true
molecular_graphs_opacity: 0.8
---
<!-- _pages/publications.md -->
<div class="publications">

{%- for y in page.years %}
  <h2 class="year">{{y}}</h2>
  {% bibliography -f papers -q @*[year={{y}}] %}
{% endfor %}

</div>
