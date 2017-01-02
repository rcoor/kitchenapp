import {
  Component, OnInit, Input, Output, EventEmitter, trigger,
  state,
  style,
  transition,
  animate,
  AnimationTransitionEvent
} from '@angular/core';

@Component({
  selector: 'app-talent',
  templateUrl: './talent.component.html',
  styleUrls: ['./talent.component.scss'],
  animations: [
    trigger('talentState', [
      state('inactive', style({
        transform: 'scale(0)'
      })),
      state('active', style({
        transform: 'scale(1.2)'
      })),
      transition('inactive => active', animate('100ms ease-in')),
      transition('active => inactive', animate('300ms ease-out'))
    ])
  ]
})
export class TalentComponent implements OnInit {

  @Input() talents: Array<Object>;
  @Output() talentClicked = new EventEmitter();

  talentState = 'inactive';
  talentObject: any;

  constructor() { }

  ngOnInit() {
  }

  filterByValue(talents: Array<Object>) {
    if (talents)
    talents.sort(function (a, b) { return (b['points'] > a['points']) ? 1 : ((a['points'] > b['points']) ? -1 : 0); });
    return talents;
  }


  clickTalent(talentIndex) {
    this.talentObject = this.talents[talentIndex];
    this.talentClicked.emit(this.talentObject);
    this.talentState = 'active';
  }

  animationDone() {
    setTimeout(() => {
      this.talentState = 'inactive';
    }, 4000)

  }

}
