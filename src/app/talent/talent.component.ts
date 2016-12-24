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

  getStyle(talentId) {
    const colors = ['#0084ff', '#44bec7', '#ffc300', '#df3544', '#d696bb', '#6699cc', '#13cf13', '#ff7e29', '#e68585', '#7646ff', '#20cef5', '#67b868', '#d4a88c', '#ff5ca1', '#a695c7']
    return colors[talentId - 1];
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
