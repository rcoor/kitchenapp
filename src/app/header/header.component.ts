import { Component, OnInit, Input, OnChanges } from '@angular/core';

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss']
})
export class HeaderComponent implements OnInit, OnChanges {

  title = "MessDefender";
  @Input() path = '';

  constructor() { }

  ngOnInit() {

  }

  ngOnChanges() {
    if (this.path == '/add') {
      this.title = "New Talent";
    } else {
      this.title = "MessDefender";
    }
  }

  editTalents() {

  }

}
